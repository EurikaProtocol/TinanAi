import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { builderProjectsTable } from "./builder-projects";

export interface BuilderAgentPlanTask {
  key: string;
  title: string;
  description: string;
  role: string;
  dependsOn: string[];
}

export interface BuilderAgentPlan {
  summary: string;
  architecture: string;
  complexity: "low" | "medium" | "high";
  tasks: BuilderAgentPlanTask[];
  risks: string[];
}

export interface BuilderAgentFinding {
  severity: "low" | "medium" | "high";
  category: string;
  path: string;
  summary: string;
}

export const builderAgentRunsTable = pgTable(
  "tinanai_builder_agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => builderProjectsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    request: text("request").notNull(),
    status: text("status").notNull().default("queued"),
    summary: text("summary"),
    plan: jsonb("plan").$type<BuilderAgentPlan>(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("tinanai_builder_agent_runs_owner_project_created_idx").on(
      table.ownerId,
      table.projectId,
      table.createdAt,
    ),
    uniqueIndex("tinanai_builder_agent_runs_one_active_owner_idx")
      .on(table.ownerId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const builderAgentTasksTable = pgTable(
  "tinanai_builder_agent_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => builderAgentRunsTable.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => builderProjectsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    taskType: text("task_type").notNull(),
    role: text("role").notNull(),
    executorAvailable: boolean("executor_available").notNull().default(false),
    status: text("status").notNull().default("queued"),
    taskKey: text("task_key"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    dependsOn: jsonb("depends_on")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("tinanai_builder_agent_tasks_run_created_idx").on(
      table.runId,
      table.createdAt,
    ),
    uniqueIndex("tinanai_builder_agent_tasks_run_task_key_unique")
      .on(table.runId, table.taskKey)
      .where(sql`${table.taskKey} is not null`),
  ],
);

export const builderAgentEventsTable = pgTable(
  "tinanai_builder_agent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => builderAgentRunsTable.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => builderAgentTasksTable.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => builderProjectsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tinanai_builder_agent_events_run_created_idx").on(
      table.runId,
      table.createdAt,
    ),
  ],
);

export const insertBuilderAgentRunSchema = createInsertSchema(
  builderAgentRunsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBuilderAgentTaskSchema = createInsertSchema(
  builderAgentTasksTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBuilderAgentEventSchema = createInsertSchema(
  builderAgentEventsTable,
).omit({ id: true, createdAt: true });

export type InsertBuilderAgentRun = z.infer<typeof insertBuilderAgentRunSchema>;
export type BuilderAgentRun = typeof builderAgentRunsTable.$inferSelect;
export type InsertBuilderAgentTask = z.infer<
  typeof insertBuilderAgentTaskSchema
>;
export type BuilderAgentTask = typeof builderAgentTasksTable.$inferSelect;
export type InsertBuilderAgentEvent = z.infer<
  typeof insertBuilderAgentEventSchema
>;
export type BuilderAgentEvent = typeof builderAgentEventsTable.$inferSelect;
