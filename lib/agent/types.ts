export type PermissionLevel = 'READ' | 'CREATE' | 'TEST' | 'PRODUCTION' | 'FINANCIAL';
export type TaskStatus =
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === 'planning' || status === 'awaiting_approval' || status === 'executing';
}

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  permission: PermissionLevel;
  tool: ToolCall | null;
};

export type AgentPlan = {
  summary: string;
  requiresApproval: boolean;
  steps: PlanStep[];
};

export type ToolResult = {
  tool: string;
  status: 'completed' | 'rejected' | 'failed';
  summary: string;
  data?: unknown;
};

export type ProgressEvent = {
  status: TaskStatus;
  message: string;
  timestamp: string;
};

export type AgentTask = {
  id: string;
  ownerId: string;
  objective: string;
  status: TaskStatus;
  provider: 'demo' | 'openai-compatible';
  simulated: boolean;
  plan: PlanStep[];
  summary: string;
  selectedTools: string[];
  toolResults: ToolResult[];
  progressEvents: ProgressEvent[];
  filesChanged: string[];
  testResult: null;
  errors: string[];
  approvalRequired: boolean;
  approvalHistory: { approved: boolean; timestamp: string }[];
  authorizedPaths: string[];
  createdAt: string;
  updatedAt: string;
};
