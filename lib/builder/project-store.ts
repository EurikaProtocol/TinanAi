import { randomUUID } from 'node:crypto';
import type { GeneratedProject, ProjectPlan } from '../agent/openai-provider';
import type { ProjectTaskStatus } from './task-status';
import { getProjectStorageBindings } from './cloudflare-storage';

export type ProjectRecord = {
  id: string;
  ownerId: string;
  name: string;
  specification: string;
  technology: string[];
  tasks: string[];
  files: string[];
  createdAt: string;
  updatedAt: string;
  latestDiff: { path: string; added: number; removed: number; patch: string }[];
  logs: { message: string; timestamp: string }[];
  checks: { check: string; status: 'passed' | 'failed' | 'unavailable' | 'cancelled'; output: string; timestamp: string }[];
  previewStatus: 'not_started';
  deploymentDraft: {
    status: 'draft';
    target: null;
    buildCommand: 'npm run build';
    automaticDeployment: false;
    requiresManualApproval: true;
  };
  repairAttempts: number;
};

export type ProjectTask = {
  id: string;
  ownerId: string;
  kind: 'generation' | 'repair' | 'check';
  projectId: string | null;
  requirements: string;
  plan: ProjectPlan | null;
  check: string | null;
  status: ProjectTaskStatus;
  progress: string[];
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

type ProjectRow = { record_json: string };
type TaskRow = { record_json: string };
type BackupRow = { project_id: string; owner_id: string; snapshot_id: string; files_json: string };

type ProjectRuntime = {
  controllers: Map<string, AbortController>;
};

const runtimeGlobal = globalThis as typeof globalThis & { tinanProjectRuntime?: ProjectRuntime };

function runtime(): ProjectRuntime {
  if (!runtimeGlobal.tinanProjectRuntime) runtimeGlobal.tinanProjectRuntime = { controllers: new Map() };
  return runtimeGlobal.tinanProjectRuntime;
}

const metadataKey = (ownerId: string, projectId: string, relative: string) =>
  `projects/${ownerId}/${projectId}/files/${relative}`;
const snapshotKey = (ownerId: string, projectId: string, snapshotId: string, relative: string) =>
  `projects/${ownerId}/${projectId}/snapshots/${snapshotId}/${relative}`;
const forbiddenPart = /^(?:\.|\.git|\.next|node_modules|\.tinan-.*|\.env(?:\..*)?|.*(?:secret|credential|private[-_]?key).*)$/i;

export function validateRelativeProjectPath(input: string): string {
  if (typeof input !== 'string') throw new Error('Project file path is not permitted.');
  const normalized = input.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.length > 240 || normalized.startsWith('/') ||
      parts.some((part) => !part || part === '.' || part === '..' || forbiddenPart.test(part)) ||
      /[\0<>:"|?*]/.test(normalized) || /\.(?:pem|key|p12|pfx)$/i.test(normalized) ||
      normalized.toLowerCase() === 'deployment.config.json') {
    throw new Error('Project file path is not permitted.');
  }
  return normalized;
}

function validateFiles(files: { path: string; content: string }[]): { path: string; content: string }[] {
  if (!Array.isArray(files) || files.length < 1 || files.length > 24) {
    throw new Error('Project workspace limit reached (24 files or 256 KiB of source).');
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  return files.map((entry) => {
    const path = validateRelativeProjectPath(entry.path);
    if (seen.has(path)) throw new Error('Duplicate project file path.');
    seen.add(path);
    if (typeof entry.content !== 'string') throw new Error('Project file content must be text.');
    totalBytes += Buffer.byteLength(entry.content, 'utf8');
    if (totalBytes > 256 * 1024) throw new Error('Project workspace limit reached (24 files or 256 KiB of source).');
    return { path, content: entry.content };
  });
}

async function readRecord(id: string, ownerId: string): Promise<ProjectRecord | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/.test(ownerId)) return undefined;
  const { TINAN_DB } = await getProjectStorageBindings();
  const row = await TINAN_DB.prepare(
    'SELECT record_json FROM projects WHERE id = ? AND owner_id = ?',
  ).bind(id, ownerId).first<ProjectRow>();
  if (!row) return undefined;
  try {
    const record = JSON.parse(row.record_json) as ProjectRecord;
    if (record.id !== id || record.ownerId !== ownerId || !Array.isArray(record.files)) return undefined;
    return record;
  } catch {
    return undefined;
  }
}

async function saveRecord(record: ProjectRecord): Promise<void> {
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    'UPDATE projects SET record_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
  ).bind(JSON.stringify(record), record.updatedAt, record.id, record.ownerId).run();
  if (!result.meta?.changes) throw new Error('Project not found.');
}

export async function createProjectTask(
  requirements: string,
  ownerId: string,
  kind: ProjectTask['kind'] = 'generation',
  projectId: string | null = null,
  check: string | null = null,
  initialStatus: ProjectTask['status'] = 'generating',
): Promise<ProjectTask> {
  if (projectId && !await getProjectForOwner(projectId, ownerId)) throw new Error('Project not found.');
  const now = new Date().toISOString();
  const task: ProjectTask = {
    id: randomUUID(),
    ownerId,
    kind,
    projectId,
    requirements,
    plan: null,
    check,
    status: initialStatus,
    progress: [initialStatus === 'planning' ? 'Project planning requested.' : 'Project task requested.'],
    errors: [],
    createdAt: now,
    updatedAt: now,
  };
  const { TINAN_DB } = await getProjectStorageBindings();
  await TINAN_DB.prepare(
    'INSERT INTO project_tasks (id, owner_id, project_id, status, kind, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(task.id, ownerId, projectId, task.status, kind, JSON.stringify(task), now, now).run();
  runtime().controllers.set(task.id, new AbortController());
  return task;
}

export async function getProjectTask(id: string, ownerId: string): Promise<ProjectTask | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { TINAN_DB } = await getProjectStorageBindings();
  const row = await TINAN_DB.prepare(
    'SELECT record_json FROM project_tasks WHERE id = ? AND owner_id = ?',
  ).bind(id, ownerId).first<TaskRow>();
  if (!row) return undefined;
  try {
    const task = JSON.parse(row.record_json) as ProjectTask;
    if (task.id !== id || task.ownerId !== ownerId) return undefined;
    if (['planning', 'generating', 'committing'].includes(task.status) &&
        Date.parse(task.updatedAt) < Date.now() - 15 * 60 * 1000) {
      const interruptedStatus = task.status;
      const staleUpdatedAt = task.updatedAt;
      task.status = 'failed';
      task.progress.push('Task was marked failed after its Worker execution did not resume.');
      task.errors.push('Task execution was interrupted by a Worker restart or timeout.');
      task.updatedAt = new Date().toISOString();
      const result = await TINAN_DB.prepare(
        "UPDATE project_tasks SET record_json = ?, status = 'failed', updated_at = ? WHERE id = ? AND owner_id = ? AND status = ? AND updated_at = ?",
      ).bind(JSON.stringify(task), task.updatedAt, id, ownerId, interruptedStatus, staleUpdatedAt).run();
      if (!result.meta?.changes) {
        const current = await TINAN_DB.prepare(
          'SELECT record_json FROM project_tasks WHERE id = ? AND owner_id = ?',
        ).bind(id, ownerId).first<TaskRow>();
        if (!current) return undefined;
        const currentTask = JSON.parse(current.record_json) as ProjectTask;
        return currentTask.id === id && currentTask.ownerId === ownerId ? currentTask : undefined;
      }
    }
    return task;
  } catch {
    return undefined;
  }
}

export const getProjectTaskForOwner = getProjectTask;

export async function countRunningChecks(ownerId: string): Promise<number> {
  const { TINAN_DB } = await getProjectStorageBindings();
  const row = await TINAN_DB.prepare(
    "SELECT COUNT(*) AS count FROM project_tasks WHERE owner_id = ? AND kind = 'check' AND status = 'generating'",
  ).bind(ownerId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function acquireProjectLock(id: string, ownerId: string): Promise<string | null> {
  if (!await getProjectForOwner(id, ownerId)) return null;
  const token = randomUUID();
  const now = Date.now();
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    'INSERT INTO project_locks (project_id, owner_id, token, lease_until) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(project_id) DO UPDATE SET owner_id = excluded.owner_id, token = excluded.token, lease_until = excluded.lease_until ' +
    'WHERE project_locks.lease_until <= ?',
  ).bind(id, ownerId, token, now + 10 * 60 * 1000, now).run();
  return result.meta?.changes ? token : null;
}

export async function releaseProjectLock(id: string, ownerId: string, token: string): Promise<void> {
  const { TINAN_DB } = await getProjectStorageBindings();
  await TINAN_DB.prepare(
    'DELETE FROM project_locks WHERE project_id = ? AND owner_id = ? AND token = ?',
  ).bind(id, ownerId, token).run();
}

export async function reserveProjectRepair(id: string, ownerId: string): Promise<ProjectRecord> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  if (record.repairAttempts >= 1) throw new Error('The single bounded AI repair attempt has already been used.');
  if (record.checks[0]?.status !== 'failed') throw new Error('Run a failed sandbox check before requesting a repair.');
  const timestamp = new Date().toISOString();
  record.repairAttempts += 1;
  record.logs.unshift({ message: 'User authorized the project’s single bounded AI repair attempt.', timestamp });
  record.logs = record.logs.slice(0, 30);
  record.updatedAt = timestamp;
  const { TINAN_DB } = await getProjectStorageBindings();
  const update = await TINAN_DB.prepare(
    'UPDATE projects SET record_json = ?, repair_attempts = ?, updated_at = ? ' +
    "WHERE id = ? AND owner_id = ? AND repair_attempts = 0 AND latest_check_status = 'failed'",
  ).bind(JSON.stringify(record), record.repairAttempts, timestamp, id, ownerId).run();
  if (!update.meta?.changes) throw new Error('The single bounded AI repair attempt has already been used.');
  return record;
}

export function getProjectTaskSignal(id: string): AbortSignal | undefined {
  return runtime().controllers.get(id)?.signal;
}

export async function setProjectTaskPlan(task: ProjectTask, plan: ProjectPlan): Promise<boolean> {
  const stored = await getProjectTask(task.id, task.ownerId);
  if (!stored || stored.status !== 'planning') {
    if (stored) Object.assign(task, stored);
    return false;
  }
  const next: ProjectTask = {
    ...stored,
    plan,
    status: 'awaiting_approval',
    progress: stored.progress.concat('Project plan is ready for your review and approval.'),
    updatedAt: new Date().toISOString(),
  };
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    "UPDATE project_tasks SET record_json = ?, status = 'awaiting_approval', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'planning'",
  ).bind(JSON.stringify(next), next.updatedAt, task.id, task.ownerId).run();
  if (!result.meta?.changes) {
    const current = await getProjectTask(task.id, task.ownerId);
    if (current) Object.assign(task, current);
    return false;
  }
  Object.assign(task, next);
  return true;
}

export async function approveProjectTask(
  id: string,
  ownerId: string,
  confirmOverwrite = false,
): Promise<ProjectTask | undefined> {
  const task = await getProjectTask(id, ownerId);
  if (!task || task.status !== 'awaiting_approval') return task;
  if (task.projectId && !confirmOverwrite) return task;
  const next: ProjectTask = {
    ...task,
    status: 'generating',
    progress: task.progress.concat('Project plan approved; source generation started.'),
    updatedAt: new Date().toISOString(),
  };
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    "UPDATE project_tasks SET record_json = ?, status = 'generating', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'awaiting_approval'",
  ).bind(JSON.stringify(next), next.updatedAt, id, ownerId).run();
  if (!result.meta?.changes) return undefined;
  Object.assign(task, next);
  return task;
}

export async function updateProjectTask(
  task: ProjectTask,
  status: ProjectTask['status'],
  message: string,
): Promise<void> {
  const stored = await getProjectTask(task.id, task.ownerId);
  if (!stored || (stored.status !== 'planning' && stored.status !== 'generating' && stored.status !== 'committing')) {
    if (stored) Object.assign(task, stored);
    return;
  }
  const next: ProjectTask = {
    ...stored,
    projectId: task.projectId,
    status,
    progress: stored.progress.concat(message),
    errors: status === 'failed' ? stored.errors.concat(message) : stored.errors,
    updatedAt: new Date().toISOString(),
  };
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    "UPDATE project_tasks SET project_id = ?, record_json = ?, status = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND status IN ('planning', 'generating', 'committing')",
  ).bind(next.projectId, JSON.stringify(next), status, next.updatedAt, task.id, task.ownerId).run();
  if (!result.meta?.changes) {
    const current = await getProjectTask(task.id, task.ownerId);
    if (current) Object.assign(task, current);
    return;
  }
  Object.assign(task, next);
  if (status !== 'generating') runtime().controllers.delete(task.id);
}

export async function beginProjectTaskCommit(task: ProjectTask, message: string): Promise<boolean> {
  const stored = await getProjectTask(task.id, task.ownerId);
  if (!stored || stored.status !== 'generating') {
    if (stored) Object.assign(task, stored);
    return false;
  }
  const next: ProjectTask = {
    ...stored,
    status: 'committing',
    progress: stored.progress.concat(message),
    updatedAt: new Date().toISOString(),
  };
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    "UPDATE project_tasks SET record_json = ?, status = 'committing', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'generating'",
  ).bind(JSON.stringify(next), next.updatedAt, task.id, task.ownerId).run();
  if (!result.meta?.changes) {
    const current = await getProjectTask(task.id, task.ownerId);
    if (current) Object.assign(task, current);
    return false;
  }
  Object.assign(task, next);
  return true;
}

export async function cancelProjectTask(id: string, ownerId: string): Promise<ProjectTask | undefined> {
  const task = await getProjectTask(id, ownerId);
  if (!task) return undefined;
  if (task.status === 'planning' || task.status === 'awaiting_approval' || task.status === 'generating') {
    const updated: ProjectTask = {
      ...task,
      status: 'cancelled',
      progress: task.progress.concat(task.status === 'awaiting_approval'
        ? 'Project plan declined by the user.'
        : 'Project task cancelled by the user.'),
      updatedAt: new Date().toISOString(),
    };
    const { TINAN_DB } = await getProjectStorageBindings();
    const result = await TINAN_DB.prepare(
      "UPDATE project_tasks SET record_json = ?, status = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND status = ?",
    ).bind(JSON.stringify(updated), updated.updatedAt, id, ownerId, task.status).run();
    if (result.meta?.changes) {
      runtime().controllers.get(id)?.abort();
      runtime().controllers.delete(id);
      return updated;
    }
    return getProjectTask(id, ownerId);
  }
  return task;
}

export async function createProject(generated: GeneratedProject, ownerId: string): Promise<ProjectRecord> {
  const files = validateFiles(generated.files);
  const { TINAN_DB, TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const count = await TINAN_DB.prepare(
    'SELECT COUNT(*) AS count FROM projects WHERE owner_id = ?',
  ).bind(ownerId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 100) throw new Error('Project storage limit reached (100 projects).');
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const record: ProjectRecord = {
    id,
    ownerId,
    name: generated.name,
    specification: generated.specification,
    technology: generated.technology,
    tasks: generated.tasks,
    files: files.map((file) => file.path),
    createdAt: timestamp,
    updatedAt: timestamp,
    latestDiff: files.map((file) => ({
      path: file.path,
      added: file.content.split('\n').length,
      removed: 0,
      patch: unifiedDiff(file.path, '', file.content),
    })),
    logs: [{ message: 'Generated source files in a durable isolated project workspace.', timestamp }],
    checks: [],
    previewStatus: 'not_started',
    deploymentDraft: {
      status: 'draft',
      target: null,
      buildCommand: 'npm run build',
      automaticDeployment: false,
      requiresManualApproval: true,
    },
    repairAttempts: 0,
  };
  const written: string[] = [];
  try {
    for (const file of files) {
      const key = metadataKey(ownerId, id, file.path);
      await TINAN_PROJECT_FILES.put(key, file.content);
      written.push(key);
    }
    await TINAN_DB.prepare(
      'INSERT INTO projects (id, owner_id, record_json, repair_attempts, latest_check_status, rollback_snapshot_id, updated_at) VALUES (?, ?, ?, 0, NULL, NULL, ?)',
    ).bind(id, ownerId, JSON.stringify(record), timestamp).run();
    return record;
  } catch (error) {
    if (written.length) await TINAN_PROJECT_FILES.delete(written);
    throw error;
  }
}

export async function listProjects(ownerId: string): Promise<ProjectRecord[]> {
  const { TINAN_DB } = await getProjectStorageBindings();
  await cleanupUnreferencedProjectSnapshots(ownerId);
  const result = await TINAN_DB.prepare(
    'SELECT record_json FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50',
  ).bind(ownerId).all<ProjectRow>();
  return (result.results ?? []).flatMap((row) => {
    try {
      const record = JSON.parse(row.record_json) as ProjectRecord;
      return record.ownerId === ownerId ? [record] : [];
    } catch {
      return [];
    }
  });
}

async function cleanupUnreferencedProjectSnapshots(ownerId: string): Promise<void> {
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    'SELECT project_id, owner_id, snapshot_id, files_json FROM project_backups WHERE owner_id = ? LIMIT 1000',
  ).bind(ownerId).all<BackupRow>();
  for (const backup of result.results ?? []) {
    try {
      await deleteSnapshotIfUnreferenced(backup.project_id, ownerId, backup.snapshot_id);
    } catch {
      // Leave failed cleanup metadata available for the next project-list request.
    }
  }
}

export async function getProject(id: string, ownerId: string): Promise<ProjectRecord | undefined> {
  return readRecord(id, ownerId);
}

export async function getProjectForOwner(id: string, ownerId: string): Promise<ProjectRecord | undefined> {
  return readRecord(id, ownerId);
}

export async function readProjectFile(id: string, relative: string, ownerId: string): Promise<string> {
  const safePath = validateRelativeProjectPath(relative);
  const record = await getProjectForOwner(id, ownerId);
  if (!record || !record.files.includes(safePath)) throw new Error('Project file not found.');
  const { TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const object = await TINAN_PROJECT_FILES.get(metadataKey(ownerId, id, safePath));
  if (!object) throw new Error('Project file not found.');
  const content = await object.text();
  if (Buffer.byteLength(content, 'utf8') > 128 * 1024) throw new Error('Project file exceeds the read limit.');
  return content;
}

export async function exportProjectFiles(
  id: string,
  ownerId: string,
): Promise<{ name: string; files: { path: string; content: Buffer }[] }> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const files = await Promise.all(record.files.map(async (relative) => ({
    path: relative,
    content: Buffer.from(await readProjectFile(id, relative, ownerId), 'utf8'),
  })));
  files.push({
    path: 'deployment.config.json',
    content: Buffer.from(JSON.stringify(record.deploymentDraft, null, 2), 'utf8'),
  });
  return { name: record.name, files };
}

export async function recordProjectLog(id: string, ownerId: string, message: string): Promise<void> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const timestamp = new Date().toISOString();
  record.logs.unshift({ message: message.slice(0, 500), timestamp });
  record.logs = record.logs.slice(0, 50);
  record.updatedAt = timestamp;
  await saveRecord(record);
}

async function createSnapshot(record: ProjectRecord): Promise<string> {
  const { TINAN_DB, TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const snapshotId = randomUUID();
  const saved: string[] = [];
  try {
    for (const relative of record.files) {
      const content = await readProjectFile(record.id, relative, record.ownerId);
      const key = snapshotKey(record.ownerId, record.id, snapshotId, relative);
      await TINAN_PROJECT_FILES.put(key, content);
      saved.push(key);
    }
    await TINAN_DB.prepare(
      'INSERT INTO project_backups (project_id, owner_id, snapshot_id, files_json, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(record.id, record.ownerId, snapshotId, JSON.stringify(record.files), new Date().toISOString()).run();
    return snapshotId;
  } catch (error) {
    if (saved.length) await TINAN_PROJECT_FILES.delete(saved);
    throw error;
  }
}

async function deleteSnapshotIfUnreferenced(id: string, ownerId: string, snapshotId: string): Promise<void> {
  const { TINAN_DB, TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const reference = await TINAN_DB.prepare(
    'SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND rollback_snapshot_id = ?',
  ).bind(id, ownerId, snapshotId).first();
  if (reference) return;
  const backup = await TINAN_DB.prepare(
    'SELECT files_json FROM project_backups WHERE project_id = ? AND owner_id = ? AND snapshot_id = ?',
  ).bind(id, ownerId, snapshotId).first<BackupRow>();
  if (!backup) return;
  let files: string[];
  try {
    files = (JSON.parse(backup.files_json) as unknown[]).map((entry) => {
      if (typeof entry !== 'string') throw new Error('Invalid snapshot file list.');
      return validateRelativeProjectPath(entry);
    });
  } catch {
    return;
  }
  await TINAN_PROJECT_FILES.delete(files.map((relative) => snapshotKey(ownerId, id, snapshotId, relative)));
  await TINAN_DB.prepare(
    'DELETE FROM project_backups WHERE project_id = ? AND owner_id = ? AND snapshot_id = ?',
  ).bind(id, ownerId, snapshotId).run();
}

export async function snapshotProject(id: string, ownerId: string): Promise<void> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const snapshotId = await createSnapshot(record);
  const { TINAN_DB } = await getProjectStorageBindings();
  await TINAN_DB.prepare(
    'UPDATE projects SET rollback_snapshot_id = ? WHERE id = ? AND owner_id = ?',
  ).bind(snapshotId, id, ownerId).run();
}

export async function rollbackProject(id: string, ownerId: string): Promise<ProjectRecord> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const { TINAN_DB, TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const projectRow = await TINAN_DB.prepare(
    'SELECT rollback_snapshot_id FROM projects WHERE id = ? AND owner_id = ?',
  ).bind(id, ownerId).first<{ rollback_snapshot_id: string | null }>();
  const snapshotId = projectRow?.rollback_snapshot_id;
  if (!snapshotId) throw new Error('No rollback snapshot is available for this project.');
  const backup = await TINAN_DB.prepare(
    'SELECT files_json FROM project_backups WHERE project_id = ? AND owner_id = ? AND snapshot_id = ?',
  ).bind(id, ownerId, snapshotId).first<BackupRow>();
  if (!backup) throw new Error('Rollback snapshot not found.');
  let files: string[];
  try {
    files = (JSON.parse(backup.files_json) as unknown[]).map((entry) => {
      if (typeof entry !== 'string') throw new Error('Invalid backup file list.');
      return validateRelativeProjectPath(entry);
    });
  } catch {
    throw new Error('Rollback snapshot is invalid.');
  }
  const restored = new Map<string, string>();
  for (const relative of files) {
    const object = await TINAN_PROJECT_FILES.get(snapshotKey(ownerId, id, snapshotId, relative));
    if (!object) throw new Error('Rollback snapshot file is missing.');
    restored.set(relative, await object.text());
  }
  for (const relative of record.files) {
    if (!restored.has(relative)) await TINAN_PROJECT_FILES.delete(metadataKey(ownerId, id, relative));
  }
  for (const [relative, content] of Array.from(restored.entries())) {
    await TINAN_PROJECT_FILES.put(metadataKey(ownerId, id, relative), content);
  }
  record.files = files;
  record.updatedAt = new Date().toISOString();
  record.logs.push({ message: 'Rolled back to the last durable project snapshot.', timestamp: record.updatedAt });
  record.latestDiff = [];
  await TINAN_DB.prepare(
    'UPDATE projects SET record_json = ?, rollback_snapshot_id = NULL, updated_at = ? WHERE id = ? AND owner_id = ?',
  ).bind(JSON.stringify(record), record.updatedAt, id, ownerId).run();
  try {
    await deleteSnapshotIfUnreferenced(id, ownerId, snapshotId);
  } catch {
    // Keep backup metadata so a later cleanup can finish after a transient R2 failure.
  }
  return record;
}

export async function writeGeneratedFiles(
  id: string,
  generated: GeneratedProject,
  ownerId: string,
): Promise<ProjectRecord> {
  const files = validateFiles(generated.files);
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const { TINAN_DB, TINAN_PROJECT_FILES } = await getProjectStorageBindings();
  const current = await TINAN_DB.prepare(
    'SELECT rollback_snapshot_id FROM projects WHERE id = ? AND owner_id = ?',
  ).bind(id, ownerId).first<{ rollback_snapshot_id: string | null }>();
  const supersededSnapshotId = current?.rollback_snapshot_id;
  const previous = new Map<string, string>();
  for (const relative of record.files) previous.set(relative, await readProjectFile(id, relative, ownerId));
  const resultingFiles = Array.from(new Set(record.files.concat(files.map((file) => file.path))));
  const resultingBytes = resultingFiles.reduce((sum, relative) => {
    const update = files.find((file) => file.path === relative);
    return sum + Buffer.byteLength(update?.content ?? previous.get(relative) ?? '', 'utf8');
  }, 0);
  if (resultingFiles.length > 24 || resultingBytes > 256 * 1024) {
    throw new Error('Project workspace limit reached (24 files or 256 KiB of source).');
  }
  const snapshotId = await createSnapshot(record);
  const saved: string[] = [];
  try {
    for (const file of files) {
      const key = metadataKey(ownerId, id, file.path);
      await TINAN_PROJECT_FILES.put(key, file.content);
      saved.push(file.path);
    }
    const diffs = files.map((file) => {
      const oldContent = previous.get(file.path) ?? '';
      const oldLines = oldContent.split('\n');
      const newLines = file.content.split('\n');
      return {
        path: file.path,
        added: newLines.filter((line) => !oldLines.includes(line)).length,
        removed: oldLines.filter((line) => !newLines.includes(line)).length,
        patch: unifiedDiff(file.path, oldContent, file.content),
      };
    });
    record.files = resultingFiles;
    record.specification = generated.specification;
    record.technology = generated.technology;
    record.tasks = generated.tasks;
    record.updatedAt = new Date().toISOString();
    record.latestDiff = diffs;
    record.logs.push({ message: `Generated ${files.length} file update(s); durable rollback snapshot saved.`, timestamp: record.updatedAt });
    const result = await TINAN_DB.prepare(
      'UPDATE projects SET record_json = ?, rollback_snapshot_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
    ).bind(JSON.stringify(record), snapshotId, record.updatedAt, id, ownerId).run();
    if (!result.meta?.changes) throw new Error('Project not found.');
  } catch (error) {
    for (const relative of saved) {
      if (previous.has(relative)) {
        await TINAN_PROJECT_FILES.put(metadataKey(ownerId, id, relative), previous.get(relative) ?? '');
      } else {
        await TINAN_PROJECT_FILES.delete(metadataKey(ownerId, id, relative));
      }
    }
    try {
      await deleteSnapshotIfUnreferenced(id, ownerId, snapshotId);
    } catch {
      // Keep backup metadata so a later cleanup can finish after a transient R2 failure.
    }
    throw error;
  }
  if (supersededSnapshotId && supersededSnapshotId !== snapshotId) {
    try {
      await deleteSnapshotIfUnreferenced(id, ownerId, supersededSnapshotId);
    } catch {
      // Retain any leftover backup metadata if object cleanup fails.
    }
  }
  return record;
}

export async function recordProjectCheck(
  id: string,
  ownerId: string,
  check: string,
  status: 'passed' | 'failed' | 'unavailable' | 'cancelled',
  output: string,
): Promise<void> {
  const record = await getProjectForOwner(id, ownerId);
  if (!record) throw new Error('Project not found.');
  const timestamp = new Date().toISOString();
  record.checks ??= [];
  record.checks.unshift({ check, status, output: output.slice(0, 12000), timestamp });
  record.checks = record.checks.slice(0, 10);
  record.logs.unshift({ message: `${check} sandbox check: ${status}.`, timestamp });
  record.logs = record.logs.slice(0, 30);
  record.updatedAt = timestamp;
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    'UPDATE projects SET record_json = ?, latest_check_status = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
  ).bind(JSON.stringify(record), status, timestamp, id, ownerId).run();
  if (!result.meta?.changes) throw new Error('Project not found.');
}

function unifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.replace(/\n$/, '').split('\n');
  const newLines = newContent.replace(/\n$/, '').split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
  const contextStart = Math.max(0, prefix - 2);
  const contextEndOld = Math.min(oldLines.length, oldLines.length - suffix + 2);
  const contextEndNew = Math.min(newLines.length, newLines.length - suffix + 2);
  const output = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${contextStart + 1},${contextEndOld - contextStart} +${contextStart + 1},${contextEndNew - contextStart} @@`,
    ...oldLines.slice(contextStart, prefix).map((line) => ` ${line}`),
    ...oldLines.slice(prefix, oldLines.length - suffix).map((line) => `-${line}`),
    ...newLines.slice(prefix, newLines.length - suffix).map((line) => `+${line}`),
    ...oldLines.slice(oldLines.length - suffix, contextEndOld).map((line) => ` ${line}`),
  ];
  const patch = output.join('\n');
  return patch.length > 4000 ? `${patch.slice(0, 4000)}\n… diff truncated` : patch;
}
