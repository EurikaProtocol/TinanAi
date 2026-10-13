import { createModelPlan, getProviderMode, ProviderError } from './openai-provider';
import { appendTaskError, getTask, getTaskSignal, transitionTask } from './task-store';
import { executeTool } from './tools';
import type { AgentPlan, AgentTask } from './types';

const sensitiveActionPattern = /\b(production|mainnet|deploy|deployment|transfer|send funds|payment|purchase|delete|remove|destroy|withdraw|approve allowance|irreversible)\b/i;

export function createDemoPlan(objective: string): AgentPlan {
  return {
    summary: 'Simulated plan only. Configure a server-side AI provider for model-generated plans.',
    requiresApproval: sensitiveActionPattern.test(objective),
    steps: [
      {
        id: '01',
        title: 'Clarify the goal',
        description: 'Identify the intended outcome, scope, and constraints.',
        permission: 'READ',
        tool: null,
      },
      {
        id: '02',
        title: 'Prepare a reviewable approach',
        description: 'Break the request into small, verifiable steps.',
        permission: 'CREATE',
        tool: null,
      },
      {
        id: '03',
        title: 'Review before action',
        description: 'Demo mode does not execute tools or change files.',
        permission: 'READ',
        tool: null,
      },
    ],
  };
}

export async function planTask(task: AgentTask): Promise<void> {
  try {
    const signal = getTaskSignal(task.id);
    const mode = getProviderMode();
    task.provider = mode;
    task.simulated = mode === 'demo';
    const plan = mode === 'demo'
      ? createDemoPlan(task.objective)
      : await createModelPlan(task.objective, task.authorizedPaths, signal);

    if (signal?.aborted || task.status === 'cancelled') return;
    task.plan = plan.steps;
    task.summary = plan.summary;
    task.approvalRequired = plan.requiresApproval || sensitiveActionPattern.test(task.objective) ||
      plan.steps.some((step) => step.permission === 'PRODUCTION' || step.permission === 'FINANCIAL');

    if (task.approvalRequired) {
      transitionTask(task.id, 'awaiting_approval', 'Plan requires explicit user approval; no tools have run.');
      return;
    }
    await executePlannedTools(task);
  } catch (error) {
    if (task.status === 'cancelled') return;
    const message = error instanceof ProviderError
      ? error.message
      : 'Task failed unexpectedly. Sensitive details were not logged.';
    appendTaskError(task.id, message);
    if (task.status === 'planning' || task.status === 'executing') {
      transitionTask(task.id, 'failed', message);
    }
  }
}

export async function approveAndExecute(task: AgentTask): Promise<void> {
  if (task.status !== 'awaiting_approval') return;
  if (task.simulated) {
    transitionTask(task.id, 'executing', 'Approval recorded; demo mode still performs no tool execution.');
    transitionTask(task.id, 'completed', 'Simulated task completed without external actions.');
    return;
  }
  await executePlannedTools(task);
}

async function executePlannedTools(task: AgentTask): Promise<void> {
  transitionTask(task.id, 'executing', task.simulated
    ? 'Demo plan is simulated; no tools will be run.'
    : 'Executing only registered, permission-checked tools.');

  if (!task.simulated) {
    for (const step of task.plan.slice(0, 6)) {
      const signal = getTaskSignal(task.id);
      if (signal?.aborted || task.status === 'cancelled') return;
      if (!step.tool) continue;
      const result = await executeTool(step.tool, step.permission, {
        task,
        workspaceRoot: process.cwd(),
      });
      task.selectedTools.push(step.tool.name);
      task.toolResults.push(result);
      task.progressEvents.push({
        status: 'executing',
        message: `${step.tool.name}: ${result.status}. ${result.summary}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (task.status === 'cancelled') return;
  transitionTask(task.id, 'completed', task.simulated
    ? 'Demo plan completed; it was simulated and no tools were run.'
    : 'Registered tool execution finished. Review tool results; no shell command or file modification was performed.');
}

export function createTaskRecord(
  id: string,
  objective: string,
  provider: 'demo' | 'openai-compatible',
  authorizedPaths: string[],
  ownerId: string,
  timestamp = new Date().toISOString(),
): AgentTask {
  return {
    id,
    ownerId,
    objective,
    status: 'planning',
    provider,
    simulated: provider === 'demo',
    plan: [],
    summary: '',
    selectedTools: [],
    toolResults: [],
    progressEvents: [{ status: 'planning', message: 'Task accepted; preparing a plan.', timestamp }],
    filesChanged: [],
    testResult: null,
    errors: [],
    approvalRequired: false,
    approvalHistory: [],
    authorizedPaths,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
