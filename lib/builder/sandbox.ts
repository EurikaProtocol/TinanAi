import type { ProjectTask } from './project-store';

export type SandboxCheck = 'lint' | 'typecheck' | 'test' | 'build';
export type SandboxResult = {
  status: 'passed' | 'failed' | 'unavailable' | 'cancelled';
  output: string;
};

export async function runSandboxCheck(
  _projectId: string,
  _ownerId: string,
  _task: ProjectTask,
  check: string,
  signal: AbortSignal,
): Promise<SandboxResult> {
  if (!['lint', 'typecheck', 'test', 'build'].includes(check)) {
    return { status: 'unavailable', output: 'Unsupported sandbox check.' };
  }
  if (signal.aborted) return { status: 'cancelled', output: 'Sandbox check cancelled before start.' };
  return {
    status: 'unavailable',
    output: 'Project execution is disabled; no generated files or commands were executed.',
  };
}
