import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GeneratedProject } from '../agent/openai-provider';

export type ProjectRecord = {
  id: string;
  name: string;
  specification: string;
  technology: string[];
  tasks: string[];
  files: string[];
  createdAt: string;
  updatedAt: string;
  latestDiff: { path: string; added: number; removed: number }[];
  logs: { message: string; timestamp: string }[];
  checks: { check: string; status: 'passed' | 'failed' | 'unavailable' | 'cancelled'; output: string; timestamp: string }[];
  previewStatus: 'not_started';
};

export type ProjectTask = {
  id: string;
  kind: 'generation' | 'check';
  projectId: string | null;
  requirements: string;
  check: string | null;
  status: 'generating' | 'completed' | 'failed' | 'cancelled';
  progress: string[];
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

type BuilderRuntime = {
  tasks: Map<string, ProjectTask>;
  controllers: Map<string, AbortController>;
  backups: Map<string, Map<string, string>>;
};

const globalBuilder = globalThis as typeof globalThis & { tinanBuilderRuntime?: BuilderRuntime };
const metadataName = '.tinan-project.json';
const forbiddenPart = /^(?:\.|\.git|\.next|node_modules|\.tinan-.*|\.env(?:\..*)?|.*(?:secret|credential|private[-_]?key).*)$/i;

function state(): BuilderRuntime {
  if (!globalBuilder.tinanBuilderRuntime) {
    globalBuilder.tinanBuilderRuntime = { tasks: new Map(), controllers: new Map(), backups: new Map() };
  }
  return globalBuilder.tinanBuilderRuntime;
}

export function createProjectTask(
  requirements: string,
  kind: ProjectTask['kind'] = 'generation',
  projectId: string | null = null,
  check: string | null = null,
): ProjectTask {
  const now = new Date().toISOString();
  const task: ProjectTask = {
    id: randomUUID(),
    kind,
    projectId,
    requirements,
    check,
    status: 'generating',
    progress: ['Project generation requested.'],
    errors: [],
    createdAt: now,
    updatedAt: now,
  };
  state().tasks.set(task.id, task);
  state().controllers.set(task.id, new AbortController());
  while (state().tasks.size > 50) {
    const oldest = state().tasks.keys().next().value as string | undefined;
    if (!oldest) break;
    state().tasks.delete(oldest);
    state().controllers.delete(oldest);
  }
  return task;
}

export function getProjectTask(id: string): ProjectTask | undefined {
  return state().tasks.get(id);
}

export function getProjectTaskSignal(id: string): AbortSignal | undefined {
  return state().controllers.get(id)?.signal;
}

export function updateProjectTask(id: string, status: ProjectTask['status'], message: string): void {
  const task = getProjectTask(id);
  if (!task || task.status !== 'generating') return;
  task.status = status;
  task.progress.push(message);
  task.updatedAt = new Date().toISOString();
  if (status === 'failed') task.errors.push(message);
}

export function cancelProjectTask(id: string): ProjectTask | undefined {
  const task = getProjectTask(id);
  if (!task) return undefined;
  if (task.status === 'generating') {
    state().controllers.get(id)?.abort();
    updateProjectTask(id, 'cancelled', 'Generation cancelled by the user.');
  }
  return task;
}

export function workspaceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.TINAN_PROJECTS_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(os.tmpdir(), 'tinan-ai-projects');
}

export function validateRelativeProjectPath(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.length > 240 || normalized.startsWith('/') ||
      parts.some((part) => !part || part === '.' || part === '..' || forbiddenPart.test(part)) ||
      /[\0<>:"|?*]/.test(normalized) || /\.(?:pem|key|p12|pfx)$/i.test(normalized)) {
    throw new Error('Project file path is not permitted.');
  }
  return normalized;
}

async function ensureRoot(): Promise<string> {
  const root = workspaceRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const realRoot = await fs.realpath(root);
  await fs.chmod(realRoot, 0o700);
  return realRoot;
}

function projectDirectory(root: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid project id.');
  return path.join(root, id);
}

async function readRecord(directory: string): Promise<ProjectRecord> {
  const metadataPath = path.join(directory, metadataName);
  const stat = await fs.lstat(metadataPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Project metadata is invalid.');
  const record = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as ProjectRecord;
  if (!record || !/^[0-9a-f-]{36}$/i.test(record.id) || !Array.isArray(record.files)) {
    throw new Error('Project metadata is invalid.');
  }
  return record;
}

async function writeRecord(directory: string, record: ProjectRecord): Promise<void> {
  const target = path.join(directory, metadataName);
  const temp = path.join(directory, `.metadata-${randomUUID()}.tmp`);
  await fs.writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
  await fs.rename(temp, target);
}

async function safeFile(directory: string, relative: string): Promise<string> {
  const normalized = validateRelativeProjectPath(relative);
  const root = await fs.realpath(directory);
  const file = path.resolve(root, normalized);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Project file path is outside the workspace.');
  let cursor = root;
  for (const part of normalized.split('/')) {
    cursor = path.join(cursor, part);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('Symbolic links are not permitted in project files.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return file;
}

export async function createProject(generated: GeneratedProject): Promise<ProjectRecord> {
  const root = await ensureRoot();
  const id = randomUUID();
  const directory = projectDirectory(root, id);
  await fs.mkdir(directory, { mode: 0o700 });
  const timestamp = new Date().toISOString();
  const files: string[] = [];

  try {
    for (const entry of generated.files) {
      const relative = validateRelativeProjectPath(entry.path);
      const file = await safeFile(directory, relative);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, entry.content, { flag: 'wx', mode: 0o600 });
      files.push(relative);
    }
    const record: ProjectRecord = {
      id,
      name: generated.name,
      specification: generated.specification,
      technology: generated.technology,
      tasks: generated.tasks,
      files,
      createdAt: timestamp,
      updatedAt: timestamp,
      latestDiff: generated.files.map((file) => ({
        path: file.path,
        added: file.content.split('\n').length,
        removed: 0,
      })),
      logs: [{ message: 'Generated source files in a new isolated project workspace.', timestamp }],
      checks: [],
      previewStatus: 'not_started',
    };
    await writeRecord(directory, record);
    return record;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const root = await ensureRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects: ProjectRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/i.test(entry.name)) continue;
    try {
      projects.push(await readRecord(projectDirectory(root, entry.name)));
    } catch {
      continue;
    }
  }
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  try {
    const root = await ensureRoot();
    const directory = projectDirectory(root, id);
    const resolved = await fs.realpath(directory);
    if (!resolved.startsWith(`${root}${path.sep}`)) return undefined;
    const record = await readRecord(resolved);
    return record.id === id ? record : undefined;
  } catch {
    return undefined;
  }
}

export async function readProjectFile(id: string, relative: string): Promise<string> {
  const root = await ensureRoot();
  const record = await getProject(id);
  if (!record || !record.files.includes(validateRelativeProjectPath(relative))) throw new Error('Project file not found.');
  const file = await safeFile(projectDirectory(root, id), relative);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('Project file exceeds the read limit.');
  return fs.readFile(file, 'utf8');
}

export async function exportProjectFiles(id: string): Promise<{ name: string; files: { path: string; content: Buffer }[] }> {
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  const files = await Promise.all(record.files.map(async (relative) => ({
    path: relative,
    content: Buffer.from(await readProjectFile(id, relative), 'utf8'),
  })));
  return { name: record.name, files };
}

export async function recordProjectLog(id: string, message: string): Promise<void> {
  const root = await ensureRoot();
  const directory = projectDirectory(root, id);
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  const timestamp = new Date().toISOString();
  record.logs.unshift({ message: message.slice(0, 500), timestamp });
  record.logs = record.logs.slice(0, 50);
  record.updatedAt = timestamp;
  await writeRecord(directory, record);
}

export async function snapshotProject(id: string): Promise<void> {
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  const backup = new Map<string, string>();
  for (const relative of record.files) backup.set(relative, await readProjectFile(id, relative));
  state().backups.set(id, backup);
}

export async function rollbackProject(id: string): Promise<ProjectRecord> {
  const backup = state().backups.get(id);
  if (!backup) throw new Error('No rollback snapshot is available for this project process.');
  const root = await ensureRoot();
  const directory = projectDirectory(root, id);
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  for (const relative of record.files) {
    const file = await safeFile(directory, relative);
    await fs.rm(file, { force: true });
  }
  const files: string[] = [];
  for (const [relative, content] of backup) {
    const file = await safeFile(directory, relative);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, content, { flag: 'wx', mode: 0o600 });
    files.push(relative);
  }
  record.files = files;
  record.updatedAt = new Date().toISOString();
  record.logs.push({ message: 'Rolled back to the last in-process project snapshot.', timestamp: record.updatedAt });
  record.latestDiff = [];
  await writeRecord(directory, record);
  state().backups.delete(id);
  return record;
}

export async function writeGeneratedFiles(id: string, generated: GeneratedProject): Promise<ProjectRecord> {
  const root = await ensureRoot();
  const directory = projectDirectory(root, id);
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  const previous = new Map(record.files.map((file) => [file, '']));
  for (const relative of record.files) previous.set(relative, await readProjectFile(id, relative));
  state().backups.set(id, previous);
  const diffs: ProjectRecord['latestDiff'] = [];
  const addedPaths: string[] = [];

  try {
    for (const entry of generated.files) {
      const relative = validateRelativeProjectPath(entry.path);
      const file = await safeFile(directory, relative);
      const existed = record.files.includes(relative);
      const oldContent = existed ? previous.get(relative) ?? '' : '';
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, entry.content, { mode: 0o600, flag: existed ? 'w' : 'wx' });
      if (!existed) addedPaths.push(relative);
      const oldLines = oldContent.split('\n');
      const newLines = entry.content.split('\n');
      diffs.push({
        path: relative,
        added: newLines.filter((line) => !oldLines.includes(line)).length,
        removed: oldLines.filter((line) => !newLines.includes(line)).length,
      });
    }

    record.files = [...new Set([...record.files, ...generated.files.map((entry) => validateRelativeProjectPath(entry.path))])];
    record.specification = generated.specification;
    record.technology = generated.technology;
    record.tasks = generated.tasks;
    record.updatedAt = new Date().toISOString();
    record.latestDiff = diffs;
    record.logs.push({ message: `Generated ${generated.files.length} file update(s); rollback snapshot saved.`, timestamp: record.updatedAt });
    await writeRecord(directory, record);
    return record;
  } catch (error) {
    for (const relative of addedPaths) {
      const file = await safeFile(directory, relative);
      await fs.rm(file, { force: true });
    }
    for (const [relative, content] of previous) {
      const file = await safeFile(directory, relative);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, content, { mode: 0o600 });
    }
    throw error;
  }
}

export async function recordProjectCheck(
  id: string,
  check: string,
  status: 'passed' | 'failed' | 'unavailable' | 'cancelled',
  output: string,
): Promise<void> {
  const root = await ensureRoot();
  const directory = projectDirectory(root, id);
  const record = await getProject(id);
  if (!record) throw new Error('Project not found.');
  record.checks ??= [];
  record.checks.unshift({
    check,
    status,
    output: output.slice(0, 12000),
    timestamp: new Date().toISOString(),
  });
  record.checks = record.checks.slice(0, 20);
  record.logs.unshift({
    message: `${check} sandbox check: ${status}.`,
    timestamp: new Date().toISOString(),
  });
  record.logs = record.logs.slice(0, 50);
  record.updatedAt = new Date().toISOString();
  await writeRecord(directory, record);
}
