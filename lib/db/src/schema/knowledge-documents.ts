import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const knowledgeCategoryEnum = pgEnum("knowledge_category", [
  "ai_engineering",
  "blockchain_solidity",
  "ethereum_standards",
  "web3_architecture",
  "crypto_tokenomics",
  "renewable_tokenization",
  "regulatory",
  "general",
]);

export const knowledgeDocumentFormatEnum = pgEnum("knowledge_document_format", [
  "pdf",
  "docx",
  "txt",
  "md",
  "json",
  "csv",
  "code",
  "zip",
]);

export const knowledgeDocumentStatusEnum = pgEnum("knowledge_document_status", [
  "queued",
  "processing",
  "ready",
  "error",
]);

export const knowledgeDocumentsTable = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    category: knowledgeCategoryEnum("category").notNull(),
    format: knowledgeDocumentFormatEnum("format").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentHash: text("content_hash").notNull(),
    status: knowledgeDocumentStatusEnum("status").notNull().default("queued"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").notNull().default(0),
    errorMessage: text("error_message"),
    warning: text("warning"),
    redacted: boolean("redacted").notNull().default(false),
    embeddingModel: text("embedding_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("knowledge_documents_owner_content_hash_uq").on(table.ownerId, table.contentHash),
    index("knowledge_documents_owner_status_idx").on(table.ownerId, table.status),
    index("knowledge_documents_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;
export type KnowledgeDocument = typeof knowledgeDocumentsTable.$inferSelect;
