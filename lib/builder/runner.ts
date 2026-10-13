import { generateProject, getOpenAICompatibleConfig, getProviderMode, ProviderError } from '../agent/openai-provider';
import { createProject, getProject, getProjectTaskSignal, recordProjectCheck, updateProjectTask, writeGeneratedFiles } from './project-store';
import { runSandboxCheck } from './sandbox';
import type { ProjectTask } from './project-store';

export async function runProjectGeneration(
  task: ProjectTask,
  generator: typeof generateProject = generateProject,
): Promise<void> {
  const signal = getProjectTaskSignal(task.id);
  try {
    if (getProviderMode() !== 'openai-compatible') {
      throw new ProviderError('Project generation requires TINAN_AI_PROVIDER=openai-compatible and server-side credentials.');
    }
    getOpenAICompatibleConfig();
    const generated = await generator(task.requirements, signal);
    if (signal?.aborted || task.status === 'cancelled') return;
    const project = task.projectId
      ? await writeGeneratedFiles(task.projectId, generated)
      : await createProject(generated);
    task.projectId = project.id;
    updateProjectTask(task.id, 'completed', `Generated ${project.files.length} files for ${project.name}.`);
  } catch (error) {
    if (task.status === 'cancelled') return;
    const message = error instanceof Error ? error.message : 'Project generation failed.';
    updateProjectTask(task.id, 'failed', message.slice(0, 500));
  }
}

export async function runProjectCheck(task: ProjectTask): Promise<void> {
  const signal = getProjectTaskSignal(task.id);
  try {
    if (!task.projectId || !task.check || !await getProject(task.projectId)) {
      throw new Error('Project or sandbox check was not found.');
    }
    updateProjectTask(task.id, 'generating', `Starting isolated ${task.check} sandbox check.`);
    const result = await runSandboxCheck(task.projectId, task, task.check, signal ?? new AbortController().signal);
    await recordProjectCheck(task.projectId, task.check, result.status, result.output);
    updateProjectTask(task.id, result.status === 'unavailable' ? 'failed' : result.status === 'cancelled' ? 'cancelled' : 'completed',
      `${task.check} sandbox check ${result.status}: ${result.output}`);
  } catch (error) {
    updateProjectTask(task.id, 'failed', error instanceof Error ? error.message : 'Sandbox check failed.');
  }
}
