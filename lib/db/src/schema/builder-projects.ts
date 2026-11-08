import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export interface BuilderProjectFileRecord {
  path: string;
  content: string;
  mediaType: string;
}

export const builderProjectsTable = pgTable(
  "tinanai_builder_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    appType: text("app_type").notNull(),
    framework: text("framework").notNull().default("static_html"),
    template: text("template").notNull(),
    files: jsonb("files").$type<BuilderProjectFileRecord[]>().notNull(),
    version: integer("version").notNull().default(1),
    previewStatus: text("preview_status").notNull().default("not_run"),
    buildStatus: text("build_status").notNull().default("not_run"),
    buildDetails: text("build_details"),
    buildAt: timestamp("build_at", { withTimezone: true, mode: "date" }),
    testStatus: text("test_status").notNull().default("not_run"),
    testDetails: text("test_details"),
    testAt: timestamp("test_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tinanai_builder_projects_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt,
    ),
  ],
);

export const builderProjectVersionsTable = pgTable(
  "tinanai_builder_project_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => builderProjectsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    files: jsonb("files").$type<BuilderProjectFileRecord[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tinanai_builder_project_versions_project_version_unique").on(
      table.projectId,
      table.version,
    ),
    index("tinanai_builder_project_versions_owner_idx").on(
      table.ownerId,
      table.projectId,
      table.version,
    ),
  ],
);
