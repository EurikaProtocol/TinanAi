import { and, desc, eq, lt } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import express, { Router, type IRouter, type RequestHandler } from "express";
import {
  CreateTinanaiBuilderProjectBody,
  DeleteTinanaiBuilderProjectParams,
  DuplicateTinanaiBuilderProjectParams,
  GetTinanaiBuilderProjectParams,
  ListTinanaiBuilderProjectVersionsParams,
  RestoreTinanaiBuilderProjectVersionParams,
  UpdateTinanaiBuilderProjectBody,
} from "@workspace/api-zod";
import {
  builderProjectVersionsTable,
  builderProjectsTable,
  db,
} from "@workspace/db";
import {
  BuilderProjectValidationError,
  validateBuilderProjectFiles,
} from "../lib/builder-project-validation";
import { redactBuilderText } from "../lib/builder-files";

const router: IRouter = Router();
const routeBase = "/tinanai/projects";
const RETAINED_VERSIONS = 10;

const requireBuilderUser: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to save and manage Builder projects." });
    return;
  }
  res.locals.builderUserId = userId;
  next();
};

router.use(routeBase, requireBuilderUser, express.json({ limit: "8mb" }));

type ProjectRow = typeof builderProjectsTable.$inferSelect;
type VersionRow = typeof builderProjectVersionsTable.$inferSelect;

function toProjectSummary(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    appType: row.appType,
    framework: row.framework,
    template: row.template,
    version: row.version,
    previewStatus: row.previewStatus,
    buildStatus: row.buildStatus,
    buildDetails: row.buildDetails,
    buildAt: row.buildAt,
    testStatus: row.testStatus,
    testDetails: row.testDetails,
    testAt: row.testAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProject(row: ProjectRow) {
  return { ...toProjectSummary(row), files: row.files };
}

function toVersion(row: VersionRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    summary: row.summary,
    files: row.files,
    createdAt: row.createdAt,
  };
}

function validationMessage(error: unknown): string {
  return error instanceof BuilderProjectValidationError
    ? error.message
    : "The project could not be saved.";
}

async function pruneProjectVersions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  currentVersion: number,
): Promise<void> {
  if (currentVersion <= RETAINED_VERSIONS) return;
  await tx
    .delete(builderProjectVersionsTable)
    .where(
      and(
        eq(builderProjectVersionsTable.projectId, projectId),
        lt(builderProjectVersionsTable.version, currentVersion - RETAINED_VERSIONS + 1),
      ),
    );
}

router.get(routeBase, async (_req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  try {
    const rows = await db
      .select()
      .from(builderProjectsTable)
      .where(eq(builderProjectsTable.ownerId, ownerId))
      .orderBy(desc(builderProjectsTable.updatedAt));
    res.json({ projects: rows.map(toProjectSummary) });
  } catch {
    res.status(500).json({ error: "Projects could not be loaded." });
  }
});

router.post(routeBase, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const parsed = CreateTinanaiBuilderProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a project name and valid project files." });
    return;
  }
  const projectName = parsed.data.name.trim();
  if (!projectName) {
    res.status(400).json({ error: "Project name cannot be blank." });
    return;
  }
  try {
    const files = validateBuilderProjectFiles(parsed.data.files, redactBuilderText);
    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(builderProjectsTable)
        .values({
          ownerId,
          name: projectName,
          description: parsed.data.description,
          appType: parsed.data.appType,
          framework: parsed.data.framework,
          template: parsed.data.template,
          files,
          version: 1,
        })
        .returning();
      await tx.insert(builderProjectVersionsTable).values({
        projectId: created.id,
        ownerId,
        version: 1,
        summary: "Initial version",
        files,
      });
      return created;
    });
    res.status(201).json({ project: toProject(project) });
  } catch (error) {
    res
      .status(error instanceof BuilderProjectValidationError ? 400 : 500)
      .json({ error: validationMessage(error) });
  }
});

router.get(`${routeBase}/:id`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = GetTinanaiBuilderProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const [project] = await db
      .select()
      .from(builderProjectsTable)
      .where(
        and(
          eq(builderProjectsTable.id, params.data.id),
          eq(builderProjectsTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.json({ project: toProject(project) });
  } catch {
    res.status(500).json({ error: "Project could not be loaded." });
  }
});

router.patch(`${routeBase}/:id`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = GetTinanaiBuilderProjectParams.safeParse(req.params);
  const parsed = UpdateTinanaiBuilderProjectBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "The project update is invalid." });
    return;
  }
  if (parsed.data.name !== undefined && !parsed.data.name.trim()) {
    res.status(400).json({ error: "Project name cannot be blank." });
    return;
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(builderProjectsTable)
        .where(
          and(
            eq(builderProjectsTable.id, params.data.id),
            eq(builderProjectsTable.ownerId, ownerId),
          ),
        )
        .limit(1);
      if (!current) return null;

      const files = parsed.data.files
        ? validateBuilderProjectFiles(parsed.data.files, redactBuilderText)
        : current.files;
      const filesChanged = JSON.stringify(files) !== JSON.stringify(current.files);
      const nextVersion = current.version + (filesChanged ? 1 : 0);
      const patch: Partial<typeof builderProjectsTable.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
      if (parsed.data.description !== undefined) patch.description = parsed.data.description;
      if (parsed.data.appType !== undefined) patch.appType = parsed.data.appType;
      if (parsed.data.framework !== undefined) patch.framework = parsed.data.framework;
      if (parsed.data.template !== undefined) patch.template = parsed.data.template;
      if (filesChanged) {
        patch.files = files;
        patch.version = nextVersion;
      }
      if (parsed.data.previewStatus !== undefined) patch.previewStatus = parsed.data.previewStatus;
      if (parsed.data.buildStatus !== undefined) patch.buildStatus = parsed.data.buildStatus;
      if (parsed.data.buildDetails !== undefined) patch.buildDetails = parsed.data.buildDetails;
      if (parsed.data.buildAt !== undefined) patch.buildAt = parsed.data.buildAt;
      if (parsed.data.testStatus !== undefined) patch.testStatus = parsed.data.testStatus;
      if (parsed.data.testDetails !== undefined) patch.testDetails = parsed.data.testDetails;
      if (parsed.data.testAt !== undefined) patch.testAt = parsed.data.testAt;

      const [saved] = await tx
        .update(builderProjectsTable)
        .set(patch)
        .where(
          and(
            eq(builderProjectsTable.id, current.id),
            eq(builderProjectsTable.ownerId, ownerId),
          ),
        )
        .returning();

      if (filesChanged) {
        await tx.insert(builderProjectVersionsTable).values({
          projectId: current.id,
          ownerId,
          version: nextVersion,
          summary: "Saved file edits",
          files,
        });
        await pruneProjectVersions(tx, current.id, nextVersion);
      }
      return saved;
    });
    if (!updated) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.json({ project: toProject(updated) });
  } catch (error) {
    res.status(error instanceof BuilderProjectValidationError ? 400 : 500).json({
      error: validationMessage(error),
    });
  }
});

router.delete(`${routeBase}/:id`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = DeleteTinanaiBuilderProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const [deleted] = await db
      .delete(builderProjectsTable)
      .where(
        and(
          eq(builderProjectsTable.id, params.data.id),
          eq(builderProjectsTable.ownerId, ownerId),
        ),
      )
      .returning({ id: builderProjectsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Project could not be deleted." });
  }
});

router.post(`${routeBase}/:id/duplicate`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = DuplicateTinanaiBuilderProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const duplicate = await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(builderProjectsTable)
        .where(
          and(
            eq(builderProjectsTable.id, params.data.id),
            eq(builderProjectsTable.ownerId, ownerId),
          ),
        )
        .limit(1);
      if (!source) return null;
      const files = source.files;
      const [created] = await tx
        .insert(builderProjectsTable)
        .values({
          ownerId,
          name: `${source.name.slice(0, 74)} copy`,
          description: source.description,
          appType: source.appType,
          framework: source.framework,
          template: source.template,
          files,
          version: 1,
        })
        .returning();
      await tx.insert(builderProjectVersionsTable).values({
        projectId: created.id,
        ownerId,
        version: 1,
        summary: "Duplicated project",
        files,
      });
      return created;
    });
    if (!duplicate) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.status(201).json({ project: toProject(duplicate) });
  } catch {
    res.status(500).json({ error: "Project could not be duplicated." });
  }
});

router.get(`${routeBase}/:id/versions`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = ListTinanaiBuilderProjectVersionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const [project] = await db
      .select({ id: builderProjectsTable.id })
      .from(builderProjectsTable)
      .where(
        and(
          eq(builderProjectsTable.id, params.data.id),
          eq(builderProjectsTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    const versions = await db
      .select()
      .from(builderProjectVersionsTable)
      .where(
        and(
          eq(builderProjectVersionsTable.projectId, project.id),
          eq(builderProjectVersionsTable.ownerId, ownerId),
        ),
      )
      .orderBy(desc(builderProjectVersionsTable.version));
    res.json({ versions: versions.map(toVersion) });
  } catch {
    res.status(500).json({ error: "Project history could not be loaded." });
  }
});

router.post(`${routeBase}/:id/versions/:version/restore`, async (req, res): Promise<void> => {
  const ownerId = res.locals.builderUserId as string;
  const params = RestoreTinanaiBuilderProjectVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project version not found." });
    return;
  }
  try {
    const restored = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(builderProjectsTable)
        .where(
          and(
            eq(builderProjectsTable.id, params.data.id),
            eq(builderProjectsTable.ownerId, ownerId),
          ),
        )
        .limit(1);
      if (!current) return null;

      const [snapshot] = await tx
        .select()
        .from(builderProjectVersionsTable)
        .where(
          and(
            eq(builderProjectVersionsTable.projectId, current.id),
            eq(builderProjectVersionsTable.ownerId, ownerId),
            eq(builderProjectVersionsTable.version, params.data.version),
          ),
        )
        .limit(1);
      if (!snapshot) return null;

      const nextVersion = current.version + 1;
      const [saved] = await tx
        .update(builderProjectsTable)
        .set({
          files: snapshot.files,
          version: nextVersion,
          previewStatus: "not_run",
          buildStatus: "not_run",
          buildDetails: null,
          buildAt: null,
          testStatus: "not_run",
          testDetails: null,
          testAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(builderProjectsTable.id, current.id),
            eq(builderProjectsTable.ownerId, ownerId),
          ),
        )
        .returning();
      await tx.insert(builderProjectVersionsTable).values({
        projectId: current.id,
        ownerId,
        version: nextVersion,
        summary: `Restored version ${snapshot.version}`,
        files: snapshot.files,
      });
      await pruneProjectVersions(tx, current.id, nextVersion);
      return saved;
    });
    if (!restored) {
      res.status(404).json({ error: "Project version not found." });
      return;
    }
    res.json({ project: toProject(restored) });
  } catch {
    res.status(500).json({ error: "Project version could not be restored." });
  }
});

export default router;
