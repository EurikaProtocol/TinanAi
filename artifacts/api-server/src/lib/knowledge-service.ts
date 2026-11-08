import { pipeline } from "@huggingface/transformers";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeCollectionsTable,
  knowledgeDocumentCollectionsTable,
  knowledgeDocumentsTable,
  type KnowledgeDocument,
} from "@workspace/db";
import { logger } from "./logger";
import {
  createKnowledgeChunks,
  extractKnowledgeDocument,
  getKnowledgeFileFormat,
  type KnowledgeChunkInput,
} from "./knowledge-files";

export const KNOWLEDGE_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMS = 384;
const EMBEDDING_BATCH_SIZE = 8;
const MAX_QUEUED_JOBS = 3;
const SEARCH_CANDIDATES = 80;
const SOURCE_EXCERPT_CHARS = 1_100;

const queue: Array<() => Promise<void>> = [];
const activeDocumentJobs = new Set<string>();
let queueRunning = false;
type EmbeddingOutput = { data: Float32Array | number[]; dims: number[] };
type EmbeddingRunner = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<EmbeddingOutput>;
let embeddingPipeline: Promise<EmbeddingRunner> | null = null;

export interface KnowledgeSearchInput {
  query: string;
  category?: KnowledgeDocument["category"];
  collectionId?: string;
  limit?: number;
}

export interface KnowledgeSourceResult {
  chunkId: string;
  documentId: string;
  title: string;
  filename: string;
  category: KnowledgeDocument["category"];
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  excerpt: string;
  score: number;
}

export interface KnowledgeDocumentDto {
  id: string;
  title: string;
  filename: string;
  category: KnowledgeDocument["category"];
  format: KnowledgeDocument["format"];
  sizeBytes: number;
  status: KnowledgeDocument["status"];
  pageCount: number | null;
  chunkCount: number;
  errorMessage: string | null;
  warning: string | null;
  redacted: boolean;
  createdAt: string;
  updatedAt: string;
  collections: Array<{ id: string; name: string }>;
}

export interface KnowledgeCollectionDto {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: string;
}

const DEFAULT_COLLECTIONS = [
  { name: "AI Engineering", description: "Models, research, evaluation, and AI systems." },
  { name: "Blockchain & Ethereum", description: "Solidity, Ethereum standards, and Web3 architecture." },
  { name: "Renewable Energy", description: "Renewable energy and tokenization source material." },
  { name: "Research & Regulation", description: "Papers, standards, and regulatory documents." },
] as const;

async function getEmbeddingPipeline(): Promise<EmbeddingRunner> {
  if (!embeddingPipeline) {
    embeddingPipeline = pipeline("feature-extraction", KNOWLEDGE_EMBEDDING_MODEL, { dtype: "q8" })
      .then((runner) => runner as unknown as EmbeddingRunner);
  }
  try {
    return await embeddingPipeline;
  } catch (error) {
    embeddingPipeline = null;
    throw error;
  }
}

export async function embedKnowledgeTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embedder = await getEmbeddingPipeline();
  const result = await embedder(texts, { pooling: "mean", normalize: true });
  const values = Array.from(result.data as Float32Array | number[]);
  const dimensions = result.dims.at(-1) ?? 0;
  if (dimensions !== EMBEDDING_DIMS || values.length !== texts.length * EMBEDDING_DIMS) {
    throw new Error("The local embedding model returned an unexpected vector size.");
  }
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const start = i * EMBEDDING_DIMS;
    vectors.push(values.slice(start, start + EMBEDDING_DIMS));
  }
  if (vectors.some((vector) => vector.some((value) => !Number.isFinite(value)))) {
    throw new Error("The local embedding model returned a non-finite vector.");
  }
  return vectors;
}

async function drainQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      try {
        await job();
      } catch (error) {
        logger.error(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Knowledge indexing job failed outside its document handler",
        );
      }
    }
  } finally {
    queueRunning = false;
    if (queue.length > 0) void drainQueue();
  }
}

export function enqueueKnowledgeJob(job: () => Promise<void>): boolean {
  if (queue.length >= MAX_QUEUED_JOBS) return false;
  queue.push(job);
  void drainQueue();
  return true;
}

export async function recoverInterruptedKnowledgeJobs(): Promise<void> {
  await db
    .update(knowledgeDocumentsTable)
    .set({
      status: "error",
      errorMessage: sql`CASE
        WHEN ${knowledgeDocumentsTable.chunkCount} > 0
          THEN 'Indexing was interrupted. Re-index the stored text chunks to try again.'
        ELSE 'Indexing was interrupted before text chunks were saved. Upload the original file again.'
      END`,
      updatedAt: new Date(),
    })
    .where(inArray(knowledgeDocumentsTable.status, ["queued", "processing"]));
}

async function saveEmbeddingBatch(
  rows: Array<{ id: string; content: string }>,
): Promise<void> {
  const vectors = await embedKnowledgeTexts(rows.map((row) => row.content));
  await Promise.all(rows.map((row, index) =>
    db
      .update(knowledgeChunksTable)
      .set({ embedding: vectors[index] ?? null })
      .where(eq(knowledgeChunksTable.id, row.id)),
  ));
}

async function markDocumentError(documentId: string, ownerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Document indexing failed for an unknown reason.";
  await db
    .update(knowledgeDocumentsTable)
    .set({
      status: "error",
      errorMessage: message.slice(0, 600),
      updatedAt: new Date(),
    })
    .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));
}

async function processNewDocument(
  documentId: string,
  ownerId: string,
  filename: string,
  buffer: Buffer,
): Promise<void> {
  try {
    const [document] = await db
      .select({ id: knowledgeDocumentsTable.id })
      .from(knowledgeDocumentsTable)
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)))
      .limit(1);
    if (!document) return;

    await db
      .update(knowledgeDocumentsTable)
      .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));

    const extracted = await extractKnowledgeDocument(buffer, filename);
    const chunks = createKnowledgeChunks(extracted.segments);
    if (chunks.length === 0) throw new Error("The document contains no readable text to index.");
    if (chunks.length > 5_000) throw new Error("The document produced too many chunks to index safely.");

    await db.transaction(async (tx) => {
      await tx.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.documentId, documentId));
      for (let offset = 0; offset < chunks.length; offset += 200) {
        const batch = chunks.slice(offset, offset + 200);
        await tx.insert(knowledgeChunksTable).values(
          batch.map((chunk) => ({
            documentId,
            ownerId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.text,
            embedding: null,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            section: chunk.section,
          })),
        );
      }
      await tx
        .update(knowledgeDocumentsTable)
        .set({
          pageCount: extracted.pageCount,
          chunkCount: chunks.length,
          warning: extracted.warning,
          redacted: extracted.redacted,
          embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));
    });

    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
      const rows = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      const records = await db
        .select({ id: knowledgeChunksTable.id, chunkIndex: knowledgeChunksTable.chunkIndex })
        .from(knowledgeChunksTable)
        .where(and(
          eq(knowledgeChunksTable.documentId, documentId),
          eq(knowledgeChunksTable.ownerId, ownerId),
          inArray(knowledgeChunksTable.chunkIndex, rows.map((row) => row.chunkIndex)),
        ));
      const idsByIndex = new Map(records.map((record) => [record.chunkIndex, record.id]));
      await saveEmbeddingBatch(
        rows.flatMap((row) => {
          const id = idsByIndex.get(row.chunkIndex);
          return id ? [{ id, content: row.text }] : [];
        }),
      );
    }

    await db
      .update(knowledgeDocumentsTable)
      .set({ status: "ready", errorMessage: null, updatedAt: new Date() })
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));
  } catch (error) {
    await markDocumentError(documentId, ownerId, error);
    logger.warn(
      { documentId, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Knowledge document extraction or indexing failed",
    );
  } finally {
    buffer.fill(0);
  }
}

export function enqueueNewKnowledgeDocument(
  documentId: string,
  ownerId: string,
  filename: string,
  buffer: Buffer,
): boolean {
  if (activeDocumentJobs.has(documentId)) return false;
  const accepted = enqueueKnowledgeJob(async () => {
    try {
      await processNewDocument(documentId, ownerId, filename, buffer);
    } finally {
      activeDocumentJobs.delete(documentId);
    }
  });
  if (accepted) activeDocumentJobs.add(documentId);
  return accepted;
}

async function processReindex(documentId: string, ownerId: string): Promise<void> {
  try {
    const [document] = await db
      .select({ id: knowledgeDocumentsTable.id })
      .from(knowledgeDocumentsTable)
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)))
      .limit(1);
    if (!document) return;
    await db
      .update(knowledgeDocumentsTable)
      .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));

    const chunks = await db
      .select({ id: knowledgeChunksTable.id, content: knowledgeChunksTable.content })
      .from(knowledgeChunksTable)
      .where(and(
        eq(knowledgeChunksTable.documentId, documentId),
        eq(knowledgeChunksTable.ownerId, ownerId),
      ))
      .orderBy(knowledgeChunksTable.chunkIndex);
    if (chunks.length === 0) throw new Error("No stored text chunks are available to re-index. Upload the source file again.");

    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
      await saveEmbeddingBatch(chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE));
    }
    await db
      .update(knowledgeDocumentsTable)
      .set({
        status: "ready",
        errorMessage: null,
        embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeDocumentsTable.id, documentId), eq(knowledgeDocumentsTable.ownerId, ownerId)));
  } catch (error) {
    await markDocumentError(documentId, ownerId, error);
    logger.warn(
      { documentId, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Knowledge document re-indexing failed",
    );
  }
}

export function enqueueKnowledgeReindex(documentId: string, ownerId: string): boolean {
  if (activeDocumentJobs.has(documentId)) return false;
  const accepted = enqueueKnowledgeJob(async () => {
    try {
      await processReindex(documentId, ownerId);
    } finally {
      activeDocumentJobs.delete(documentId);
    }
  });
  if (accepted) activeDocumentJobs.add(documentId);
  return accepted;
}

export async function findDuplicateKnowledgeDocument(
  ownerId: string,
  contentHash: string,
): Promise<KnowledgeDocument | null> {
  const [document] = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.ownerId, ownerId),
      eq(knowledgeDocumentsTable.contentHash, contentHash),
    ))
    .limit(1);
  return document ?? null;
}

export async function ensureDefaultKnowledgeCollections(ownerId: string): Promise<void> {
  for (const collection of DEFAULT_COLLECTIONS) {
    await db
      .insert(knowledgeCollectionsTable)
      .values({ ownerId, ...collection })
      .onConflictDoNothing({
        target: [knowledgeCollectionsTable.ownerId, knowledgeCollectionsTable.name],
      });
  }
}

export async function validateOwnedCollectionIds(ownerId: string, collectionIds: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(collectionIds)];
  if (uniqueIds.length === 0) return true;
  const owned = await db
    .select({ id: knowledgeCollectionsTable.id })
    .from(knowledgeCollectionsTable)
    .where(and(
      eq(knowledgeCollectionsTable.ownerId, ownerId),
      inArray(knowledgeCollectionsTable.id, uniqueIds),
    ));
  return owned.length === uniqueIds.length;
}

async function getCollectionTagsByDocument(
  ownerId: string,
  documentIds: string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  if (documentIds.length === 0) return new Map();
  const rows = await db
    .select({
      documentId: knowledgeDocumentCollectionsTable.documentId,
      id: knowledgeCollectionsTable.id,
      name: knowledgeCollectionsTable.name,
    })
    .from(knowledgeDocumentCollectionsTable)
    .innerJoin(
      knowledgeCollectionsTable,
      and(
        eq(knowledgeDocumentCollectionsTable.collectionId, knowledgeCollectionsTable.id),
        eq(knowledgeCollectionsTable.ownerId, ownerId),
      ),
    )
    .where(and(
      eq(knowledgeDocumentCollectionsTable.ownerId, ownerId),
      inArray(knowledgeDocumentCollectionsTable.documentId, documentIds),
    ));
  const result = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    const tags = result.get(row.documentId) ?? [];
    tags.push({ id: row.id, name: row.name });
    result.set(row.documentId, tags);
  }
  return result;
}

function toDocumentDto(
  document: KnowledgeDocument,
  tags: Array<{ id: string; name: string }>,
): KnowledgeDocumentDto {
  return {
    id: document.id,
    title: document.title,
    filename: document.filename,
    category: document.category,
    format: document.format,
    sizeBytes: document.sizeBytes,
    status: document.status,
    pageCount: document.pageCount,
    chunkCount: document.chunkCount,
    errorMessage: document.errorMessage,
    warning: document.warning,
    redacted: document.redacted,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    collections: tags,
  };
}

export async function getKnowledgeDocumentDto(
  ownerId: string,
  documentId: string,
): Promise<KnowledgeDocumentDto | null> {
  const [document] = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.id, documentId),
      eq(knowledgeDocumentsTable.ownerId, ownerId),
    ))
    .limit(1);
  if (!document) return null;
  const tags = await getCollectionTagsByDocument(ownerId, [document.id]);
  return toDocumentDto(document, tags.get(document.id) ?? []);
}

export async function listKnowledgeDocumentDtos(ownerId: string): Promise<KnowledgeDocumentDto[]> {
  const documents = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.ownerId, ownerId))
    .orderBy(desc(knowledgeDocumentsTable.createdAt));
  const tags = await getCollectionTagsByDocument(ownerId, documents.map((document) => document.id));
  return documents.map((document) => toDocumentDto(document, tags.get(document.id) ?? []));
}

export async function listKnowledgeCollectionDtos(ownerId: string): Promise<KnowledgeCollectionDto[]> {
  await ensureDefaultKnowledgeCollections(ownerId);
  const collections = await db
    .select()
    .from(knowledgeCollectionsTable)
    .where(eq(knowledgeCollectionsTable.ownerId, ownerId))
    .orderBy(desc(knowledgeCollectionsTable.createdAt));
  const counts = await db
    .select({
      collectionId: knowledgeDocumentCollectionsTable.collectionId,
      documentCount: count(knowledgeDocumentCollectionsTable.documentId),
    })
    .from(knowledgeDocumentCollectionsTable)
    .where(eq(knowledgeDocumentCollectionsTable.ownerId, ownerId))
    .groupBy(knowledgeDocumentCollectionsTable.collectionId);
  const countById = new Map(counts.map((row) => [row.collectionId, Number(row.documentCount)]));
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    documentCount: countById.get(collection.id) ?? 0,
    createdAt: collection.createdAt.toISOString(),
  }));
}

export async function listKnowledgeSources(
  ownerId: string,
  input: KnowledgeSearchInput,
): Promise<KnowledgeSourceResult[]> {
  const query = input.query.trim();
  const [queryVector] = await embedKnowledgeTexts([query]);
  if (!queryVector) return [];
  const vectorLiteral = `[${queryVector.map((value) => value.toFixed(7)).join(",")}]`;
  const category = input.category ?? null;
  const collectionId = input.collectionId ?? null;
  const limit = Math.min(12, Math.max(1, input.limit ?? 8));
  const rows = await db.execute(sql`
    WITH semantic_candidates AS (
      SELECT
        c.id AS chunk_id,
        c.document_id,
        c.content,
        c.page_start,
        c.page_end,
        c.section,
        d.title,
        d.filename,
        d.category,
        (1.0 - (c.embedding <=> ${vectorLiteral}::vector))::double precision AS semantic_score
      FROM knowledge_chunks AS c
      INNER JOIN knowledge_documents AS d ON d.id = c.document_id
      WHERE c.owner_id = ${ownerId}
        AND d.owner_id = ${ownerId}
        AND d.status = 'ready'
        AND c.embedding IS NOT NULL
        AND (${category}::text IS NULL OR d.category::text = ${category})
        AND (
          ${collectionId}::uuid IS NULL
          OR EXISTS (
            SELECT 1
            FROM knowledge_document_collections AS dc
            WHERE dc.owner_id = ${ownerId}
              AND dc.document_id = d.id
              AND dc.collection_id = ${collectionId}::uuid
          )
        )
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${SEARCH_CANDIDATES}
    )
    SELECT
      chunk_id,
      document_id,
      content,
      page_start,
      page_end,
      section,
      title,
      filename,
      category,
      LEAST(
        1.0,
        GREATEST(
          0.0,
          semantic_score + CASE
            WHEN to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query}) THEN 0.08
            ELSE 0.0
          END
        )
      )::double precision AS score
    FROM semantic_candidates
    ORDER BY score DESC, semantic_score DESC
    LIMIT ${limit}
  `);
  const rawRows = rows.rows as Array<Record<string, unknown>>;
  return rawRows.map((row) => {
    const content = String(row.content ?? "");
    const score = Number(row.score);
    return {
      chunkId: String(row.chunk_id),
      documentId: String(row.document_id),
      title: String(row.title),
      filename: String(row.filename),
      category: String(row.category) as KnowledgeDocument["category"],
      pageStart: row.page_start == null ? null : Number(row.page_start),
      pageEnd: row.page_end == null ? null : Number(row.page_end),
      section: row.section == null ? null : String(row.section),
      excerpt: content.length > SOURCE_EXCERPT_CHARS
        ? `${content.slice(0, SOURCE_EXCERPT_CHARS).trimEnd()}…`
        : content,
      score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0,
    };
  });
}

export async function updateKnowledgeDocumentMetadata(
  ownerId: string,
  documentId: string,
  category: KnowledgeDocument["category"],
  collectionIds: string[],
): Promise<KnowledgeDocumentDto | null> {
  if (!(await validateOwnedCollectionIds(ownerId, collectionIds))) {
    throw new Error("One or more selected collections are not available to this account.");
  }
  const [document] = await db
    .update(knowledgeDocumentsTable)
    .set({ category, updatedAt: new Date() })
    .where(and(
      eq(knowledgeDocumentsTable.id, documentId),
      eq(knowledgeDocumentsTable.ownerId, ownerId),
    ))
    .returning();
  if (!document) return null;

  await db.transaction(async (tx) => {
    await tx
      .delete(knowledgeDocumentCollectionsTable)
      .where(and(
        eq(knowledgeDocumentCollectionsTable.ownerId, ownerId),
        eq(knowledgeDocumentCollectionsTable.documentId, documentId),
      ));
    if (collectionIds.length > 0) {
      await tx
        .insert(knowledgeDocumentCollectionsTable)
        .values([...new Set(collectionIds)].map((collectionId) => ({
          ownerId,
          documentId,
          collectionId,
        })))
        .onConflictDoNothing();
    }
  });
  return getKnowledgeDocumentDto(ownerId, documentId);
}
