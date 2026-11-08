import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { knowledgeDocumentsTable } from "./knowledge-documents";

const vector384 = customType<{ data: number[] | null; driverData: string | null }>({
  dataType: () => "vector(384)",
  toDriver: (value) => value === null ? null : `[${value.join(",")}]`,
  fromDriver: (value) => {
    if (value === null) return null;
    const source = value.slice(1, -1);
    return source ? source.split(",").map(Number) : [];
  },
});

export const knowledgeChunksTable = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector384("embedding"),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    section: text("section"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_chunks_document_index_uq").on(table.documentId, table.chunkIndex),
    index("knowledge_chunks_owner_document_idx").on(table.ownerId, table.documentId),
    index("knowledge_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const insertKnowledgeChunkSchema = createInsertSchema(knowledgeChunksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertKnowledgeChunk = z.infer<typeof insertKnowledgeChunkSchema>;
export type KnowledgeChunk = typeof knowledgeChunksTable.$inferSelect;
