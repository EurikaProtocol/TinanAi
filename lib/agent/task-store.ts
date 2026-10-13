import type { AgentTask, TaskStatus } from './types';

type Runtime = {
  tasks: Map<string, AgentTask>;
  controllers: Map<string, AbortController>;
  requests: Map<string, number[]>;
};

const globalRuntime = globalThis as typeof globalThis & { tinanAgentRuntime?: Runtime };

function runtime(): Runtime {
  if (!globalRuntime.tinanAgentRuntime) {
    globalRuntime.tinanAgentRuntime = {
      tasks: new Map(),
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

export function createTask(task: AgentTask): void {
  const store = runtime();
  store.tasks.set(task.id, task);
  store.controllers.set(task.id, new AbortController());
  while (store.tasks.size > 100) {
    const oldest = store.tasks.keys().next().value as string | undefined;
    if (!oldest) break;
    store.tasks.delete(oldest);
    store.controllers.delete(oldest);
  }
}

export function getTask(id: string): AgentTask | undefined {
  return runtime().tasks.get(id);
}

export function getTaskForOwner(id: string, ownerId: string): AgentTask | undefined {
  const task = getTask(id);
  return task?.ownerId === ownerId ? task : undefined;
}

export function getTaskSignal(id: string): AbortSignal | undefined {
  return runtime().controllers.get(id)?.signal;
}

export function transitionTask(id: string, status: TaskStatus, message: string): AgentTask {
  const task = getTask(id);
  if (!task) throw new Error('Task not found.');
  if (!transitions[task.status].includes(status)) {
    throw new Error(`Invalid task transition: ${task.status} -> ${status}.`);
  }
  task.status = status;
  task.updatedAt = new Date().toISOString();
  task.progressEvents.push({ status, message, timestamp: task.updatedAt });
  return task;
}

export function appendTaskError(id: string, message: string): void {
  const task = getTask(id);
  if (task) task.errors.push(message.slice(0, 500));
}

export function cancelTask(id: string, ownerId: string): AgentTask | undefined {
  const task = getTaskForOwner(id, ownerId);
  if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return task;
  runtime().controllers.get(id)?.abort();
  transitionTask(id, 'cancelled', 'Task cancelled by the user.');
  return task;
}

export function recordApproval(id: string, approved: boolean, ownerId: string): AgentTask {
  const task = getTaskForOwner(id, ownerId);
  if (!task || task.status !== 'awaiting_approval') {
    throw new Error('This task is not waiting for approval.');
  }
  task.approvalHistory.push({ approved, timestamp: new Date().toISOString() });
  if (!approved) {
    transitionTask(id, 'cancelled', 'User declined the requested approval.');
  }
  return task;
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
