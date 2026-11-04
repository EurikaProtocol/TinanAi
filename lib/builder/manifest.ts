import { contentDigest, manifestDigest, planDigest, BUILDER_CONTRACT_VERSION, type ManifestFile } from './digest';
import { getProjectForOwner, getProjectTaskForOwner, readProjectFile } from './project-store';

export const MANIFEST_MAX_FILES = 24;
export const MANIFEST_MAX_FILE_BYTES = 128 * 1024;
export const MANIFEST_MAX_TOTAL_BYTES = 256 * 1024;

export class ManifestError extends Error {
  constructor(readonly status: 404 | 409 | 422, readonly code: string, message: string) {
    super(message);
  }
}

export type TaskManifest = {
  contractVersion: typeof BUILDER_CONTRACT_VERSION;
  taskId: string;
  projectId: string;
  ownerId: string;
  planDigest: string;
  files: ManifestFile[];
  totalBytes: number;
  manifestDigest: string;
};

/**
 * Bounded, owner-scoped manifest of a COMPLETED generation task: per-file byte length and SHA-256 computed from the stored
 * content at request time. Never returns file contents.
 */
export async function buildTaskManifest(taskId: string, ownerId: string): Promise<TaskManifest> {
  const task = await getProjectTaskForOwner(taskId, ownerId);
  if (!task) throw new ManifestError(404, 'NOT_FOUND', 'Project task not found.');
  if (task.kind !== 'generation' || task.status !== 'completed' || !task.projectId || !task.plan) {
    throw new ManifestError(409, 'NOT_COMPLETED', 'A manifest is only available for a completed generation task.');
  }
  const digest = planDigest(task.plan);
  if (task.planDigest && task.planDigest !== digest) {
    throw new ManifestError(409, 'PLAN_DIGEST_MISMATCH', 'The stored plan no longer matches its recorded digest.');
  }
  const project = await getProjectForOwner(task.projectId, ownerId);
  if (!project) throw new ManifestError(404, 'NOT_FOUND', 'Project not found.');
  if (project.files.length < 1 || project.files.length > MANIFEST_MAX_FILES) {
    throw new ManifestError(422, 'LIMIT_EXCEEDED', `Project must contain 1-${MANIFEST_MAX_FILES} files.`);
  }
  const files: ManifestFile[] = [];
  let totalBytes = 0;
  for (const path of project.files) {
    const content = await readProjectFile(project.id, path, ownerId);
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;
    if (bytes > MANIFEST_MAX_FILE_BYTES || totalBytes > MANIFEST_MAX_TOTAL_BYTES) {
      throw new ManifestError(422, 'LIMIT_EXCEEDED', 'Project files exceed the manifest size limits.');
    }
    files.push({ path, bytes, sha256: contentDigest(content) });
  }
  return {
    contractVersion: BUILDER_CONTRACT_VERSION,
    taskId: task.id,
    projectId: project.id,
    ownerId,
    planDigest: digest,
    files,
    totalBytes,
    manifestDigest: manifestDigest(digest, files),
  };
}
