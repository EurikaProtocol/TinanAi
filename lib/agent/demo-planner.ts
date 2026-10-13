export type PermissionLevel = 'READ' | 'CREATE' | 'TEST' | 'PRODUCTION' | 'FINANCIAL';

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  permission: PermissionLevel;
};

export type DemoTask = {
  id: string;
  objective: string;
  status: 'planned';
  selectedTools: string[];
  plan: PlanStep[];
  progressEvents: { status: string; message: string; timestamp: string }[];
  filesChanged: string[];
  testResult: null;
  errors: string[];
  approvalRequired: boolean;
};

const sensitiveActionPattern = /\b(production|mainnet|deploy|deployment|transfer|send funds|payment|purchase|delete|remove|destroy|withdraw|approve allowance)\b/i;

export function createDemoTask(objective: string, id: string, timestamp: string): DemoTask {
  const approvalRequired = sensitiveActionPattern.test(objective);

  const plan: PlanStep[] = [
    {
      id: '01',
      title: 'Clarify the goal',
      description: 'Identify the requested outcome and any constraints that need to be confirmed.',
      permission: 'READ',
    },
    {
      id: '02',
      title: 'Prepare an approach',
      description: 'Break the objective into reviewable steps and identify relevant capabilities.',
      permission: 'CREATE',
    },
    {
      id: '03',
      title: approvalRequired ? 'Request explicit approval' : 'Review before any action',
      description: approvalRequired
        ? 'A sensitive or irreversible action was detected. Obtain explicit approval before execution.'
        : 'A human must review and approve any future execution; this demo does not run tools.',
      permission: approvalRequired ? 'PRODUCTION' : 'READ',
    },
  ];

  return {
    id,
    objective,
    status: 'planned',
    selectedTools: [],
    plan,
    progressEvents: [
      { status: 'planned', message: 'Generated a simulated plan; no execution was started.', timestamp },
    ],
    filesChanged: [],
    testResult: null,
    errors: [],
    approvalRequired,
  };
}
