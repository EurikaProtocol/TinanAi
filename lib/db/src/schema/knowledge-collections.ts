import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { knowledgeDocumentsTable } from "./knowledge-documents";

export const knowledgeCollectionsTable = pgTable(
  "knowledge_collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("knowledge_collections_owner_name_uq").on(table.ownerId, table.name),
    index("knowledge_collections_owner_idx").on(table.ownerId),
  ],
);

export const knowledgeDocumentCollectionsTable = pgTable(
  "knowledge_document_collections",
  {
    ownerId: text("owner_id").notNull(),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").notNull().references(() => knowledgeCollectionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.collectionId] }),
    index("knowledge_document_collections_owner_collection_idx").on(table.ownerId, table.collectionId),
    index("knowledge_document_collections_owner_document_idx").on(table.ownerId, table.documentId),
  ],
);

export const insertKnowledgeCollectionSchema = createInsertSchema(knowledgeCollectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnowledgeCollection = z.infer<typeof insertKnowledgeCollectionSchema>;
export type KnowledgeCollection = typeof knowledgeCollectionsTable.$inferSelect;
