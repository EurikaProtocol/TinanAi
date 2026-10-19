import { getProjectStorageBindings } from '../builder/cloudflare-storage';
import type { AgentTask, TaskStatus } from './types';

type Runtime = {
  controllers: Map<string, AbortController>;
  requests: Map<string, number[]>;
};

type TaskRow = { record_json: string };

const globalRuntime = globalThis as typeof globalThis & { tinanAgentRuntime?: Runtime };

function runtime(): Runtime {
  if (!globalRuntime.tinanAgentRuntime) {
    globalRuntime.tinanAgentRuntime = {
      controllers: new Map(),
      requests: new Map(),
    };
  }
  return globalRuntime.tinanAgentRuntime;
}

const transitions: Record<TaskStatus, TaskStatus[]> = {
  planning: ['awaiting_approval', 'executing', 'completed', 'failed', 'cancelled'],
  awaiting_approval: ['executing', 'cancelled'],
  executing: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export async function createTask(task: AgentTask): Promise<void> {
  const { TINAN_DB } = await getProjectStorageBindings();
  await TINAN_DB.prepare(
    'INSERT INTO agent_tasks (id, owner_id, status, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(task.id, task.ownerId, task.status, JSON.stringify(task), task.createdAt, task.updatedAt).run();
  runtime().controllers.set(task.id, new AbortController());
}

export async function getTask(id: string): Promise<AgentTask | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { TINAN_DB } = await getProjectStorageBindings();
  const row = await TINAN_DB.prepare(
    'SELECT record_json FROM agent_tasks WHERE id = ?',
  ).bind(id).first<TaskRow>();
  return row ? recoverInterruptedTask(row.record_json, id) : undefined;
}

export async function getTaskForOwner(id: string, ownerId: string): Promise<AgentTask | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/.test(ownerId)) return undefined;
  const { TINAN_DB } = await getProjectStorageBindings();
  const row = await TINAN_DB.prepare(
    'SELECT record_json FROM agent_tasks WHERE id = ? AND owner_id = ?',
  ).bind(id, ownerId).first<TaskRow>();
  return row ? recoverInterruptedTask(row.record_json, id, ownerId) : undefined;
}

export function getTaskSignal(id: string): AbortSignal | undefined {
  return runtime().controllers.get(id)?.signal;
}

export async function transitionTask(id: string, status: TaskStatus, message: string): Promise<AgentTask> {
  const task = await getTask(id);
  if (!task) throw new Error('Task not found.');
  if (!transitions[task.status].includes(status)) {
    throw new Error(`Invalid task transition: ${task.status} -> ${status}.`);
  }
  const updatedAt = new Date().toISOString();
  const next: AgentTask = {
    ...task,
    status,
    updatedAt,
    progressEvents: task.progressEvents.concat({ status, message, timestamp: updatedAt }),
  };
  const written = await compareAndSetTask(task, next);
  if (written) {
    if (['completed', 'failed', 'cancelled'].includes(status)) runtime().controllers.delete(id);
    return next;
  }
  return (await getTask(id)) ?? task;
}

export async function updateTask(task: AgentTask): Promise<AgentTask> {
  const current = await getTask(task.id);
  if (!current || current.ownerId !== task.ownerId) return current ?? task;
  if (current.status !== task.status || current.updatedAt !== task.updatedAt) {
    Object.assign(task, current);
    return current;
  }
  const next: AgentTask = {
    ...current,
    updatedAt: new Date().toISOString(),
    provider: task.provider,
    simulated: task.simulated,
    plan: task.plan,
    summary: task.summary,
    selectedTools: task.selectedTools,
    toolResults: task.toolResults,
    filesChanged: task.filesChanged,
    testResult: task.testResult,
    approvalRequired: task.approvalRequired,
    approvalHistory: task.approvalHistory,
    authorizedPaths: task.authorizedPaths,
  };
  if (await compareAndSetTask(current, next)) {
    Object.assign(task, next);
    return next;
  }
  const latest = (await getTask(task.id)) ?? current;
  Object.assign(task, latest);
  return latest;
}

export async function appendTaskError(id: string, message: string): Promise<AgentTask | undefined> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = await getTask(id);
    if (!task || !['planning', 'executing'].includes(task.status)) return task;
    const next = {
      ...task,
      errors: task.errors.concat(message.slice(0, 500)),
      updatedAt: new Date().toISOString(),
    };
    if (await compareAndSetTask(task, next)) return next;
  }
  return getTask(id);
}

export async function cancelTask(id: string, ownerId: string): Promise<AgentTask | undefined> {
  const task = await getTaskForOwner(id, ownerId);
  if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return task;
  const updatedAt = new Date().toISOString();
  const next: AgentTask = {
    ...task,
    status: 'cancelled',
    updatedAt,
    progressEvents: task.progressEvents.concat({
      status: 'cancelled',
      message: 'Task cancelled by the user.',
      timestamp: updatedAt,
    }),
  };
  if (await compareAndSetTask(task, next)) {
    runtime().controllers.get(id)?.abort();
    runtime().controllers.delete(id);
    return next;
  }
  const current = await getTaskForOwner(id, ownerId);
  if (current?.status === 'cancelled') runtime().controllers.get(id)?.abort();
  return current;
}

export async function recordApproval(id: string, approved: boolean, ownerId: string): Promise<AgentTask> {
  const task = await getTaskForOwner(id, ownerId);
  if (!task || task.status !== 'awaiting_approval' || task.approvalHistory.length > 0) {
    throw new Error('This task is not waiting for approval or has already been handled.');
  }
  const updatedAt = new Date().toISOString();
  const next: AgentTask = {
    ...task,
    status: approved ? task.status : 'cancelled',
    updatedAt,
    approvalHistory: task.approvalHistory.concat({ approved, timestamp: updatedAt }),
    progressEvents: approved ? task.progressEvents : task.progressEvents.concat({
      status: 'cancelled',
      message: 'User declined the requested approval.',
      timestamp: updatedAt,
    }),
  };
  if (!await compareAndSetTask(task, next)) {
    throw new Error('Task state changed before approval could be recorded.');
  }
  if (!approved) {
    runtime().controllers.get(id)?.abort();
    runtime().controllers.delete(id);
  }
  return next;
}

export function allowRequest(key: string, now = Date.now(), limit = 20): boolean {
  const requests = runtime().requests;
  const recent = (requests.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= limit) {
    requests.set(key, recent);
    return false;
  }
  recent.push(now);
  requests.set(key, recent);
  return true;
}

async function compareAndSetTask(current: AgentTask, next: AgentTask): Promise<boolean> {
  const { TINAN_DB } = await getProjectStorageBindings();
  const result = await TINAN_DB.prepare(
    'UPDATE agent_tasks SET status = ?, record_json = ?, updated_at = ? ' +
    'WHERE id = ? AND owner_id = ? AND status = ? AND updated_at = ? AND record_json = ?',
  ).bind(
    next.status,
    JSON.stringify(next),
    next.updatedAt,
    current.id,
    current.ownerId,
    current.status,
    current.updatedAt,
    JSON.stringify(current),
  ).run();
  return Boolean(result.meta?.changes);
}

async function recoverInterruptedTask(
  recordJson: string,
  id: string,
  ownerId?: string,
): Promise<AgentTask | undefined> {
  let task: AgentTask;
  try {
    task = JSON.parse(recordJson) as AgentTask;
  } catch {
    return undefined;
  }
  if (task.id !== id || (ownerId !== undefined && task.ownerId !== ownerId) ||
      !/^[a-f0-9]{64}$/.test(task.ownerId) || !Array.isArray(task.progressEvents) ||
      !Array.isArray(task.errors)) return undefined;
  if (!['planning', 'executing'].includes(task.status) ||
      Date.parse(task.updatedAt) >= Date.now() - 15 * 60 * 1000) return task;

  const failedAt = new Date().toISOString();
  const next: AgentTask = {
    ...task,
    status: 'failed',
    updatedAt: failedAt,
    progressEvents: task.progressEvents.concat({
      status: 'failed',
      message: 'Task was marked failed after its Worker execution did not resume.',
      timestamp: failedAt,
    }),
    errors: task.errors.concat('Task execution was interrupted by a Worker restart or timeout.'),
  };
  if (await compareAndSetTask(task, next)) return next;
  return ownerId ? getTaskForOwner(id, ownerId) : getTask(id);
}
