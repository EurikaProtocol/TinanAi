import { createProjectPlan, generateProject, getOpenAICompatibleConfig, getProviderMode, ProviderError } from '../agent/openai-provider';
import { acquireProjectLock, beginProjectTaskCommit, createProject, getProject, getProjectTaskForOwner, getProjectTaskSignal, recordProjectCheck, releaseProjectLock, setProjectTaskPlan, updateProjectTask, writeGeneratedFiles } from './project-store';
import { runSandboxCheck } from './sandbox';
import type { ProjectTask } from './project-store';

export async function runProjectPlanning(
  task: ProjectTask,
  planner: typeof createProjectPlan = createProjectPlan,
): Promise<void> {
  const signal = getProjectTaskSignal(task.id);
  try {
    if (task.status !== 'planning') return;
    if (getProviderMode() !== 'openai-compatible') {
      throw new ProviderError('Project planning requires TINAN_AI_PROVIDER=openai-compatible and server-side credentials.');
    }
    getOpenAICompatibleConfig();
    const plan = await planner(task.requirements, signal);
    const currentTask = await getProjectTaskForOwner(task.id, task.ownerId);
    if (signal?.aborted || !currentTask || currentTask.status !== 'planning') {
      if (currentTask) Object.assign(task, currentTask);
      return;
    }
    await setProjectTaskPlan(task, plan);
  } catch (error) {
    if (task.status === 'cancelled') return;
    const message = error instanceof Error ? error.message : 'Project planning failed.';
    await updateProjectTask(task, 'failed', message.slice(0, 500));
  }
}

export async function runProjectGeneration(
  task: ProjectTask,
  generator: typeof generateProject = generateProject,
): Promise<void> {
  const lock = task.projectId ? await acquireProjectLock(task.projectId, task.ownerId) : null;
  if (task.projectId && !lock) {
    await updateProjectTask(task, 'failed', 'Another generation is already updating this project.');
    return;
  }
  const signal = getProjectTaskSignal(task.id);
  try {
    if (getProviderMode() !== 'openai-compatible') {
      throw new ProviderError('Project generation requires TINAN_AI_PROVIDER=openai-compatible and server-side credentials.');
    }
    getOpenAICompatibleConfig();
    const generated = await generator(task.requirements, signal);
    const currentTask = await getProjectTaskForOwner(task.id, task.ownerId);
    if (signal?.aborted || !currentTask || currentTask.status !== 'generating') {
      if (currentTask) Object.assign(task, currentTask);
      return;
    }
    if (!await beginProjectTaskCommit(task, 'Generation completed; saving project changes.')) return;
    const project = task.projectId
      ? await writeGeneratedFiles(task.projectId, generated, task.ownerId)
      : await createProject(generated, task.ownerId);
    task.projectId = project.id;
    await updateProjectTask(task, 'completed', `Generated ${project.files.length} files for ${project.name}.`);
  } catch (error) {
    if (task.status === 'cancelled') return;
    const message = error instanceof Error ? error.message : 'Project generation failed.';
    await updateProjectTask(task, 'failed', message.slice(0, 500));
  } finally {
    if (task.projectId && lock) await releaseProjectLock(task.projectId, task.ownerId, lock);
  }
}

export async function runProjectCheck(task: ProjectTask): Promise<void> {
  const signal = getProjectTaskSignal(task.id);
  const lock = task.projectId ? await acquireProjectLock(task.projectId, task.ownerId) : null;
  if (task.projectId && !lock) {
    await updateProjectTask(task, 'failed', 'Another project task is currently using this workspace.');
    return;
  }
  try {
    if (!task.projectId || !task.check || !await getProject(task.projectId, task.ownerId)) {
      throw new Error('Project or sandbox check was not found.');
    }
    const result = await runSandboxCheck(task.projectId, task.ownerId, task, task.check, signal ?? new AbortController().signal);
    await recordProjectCheck(task.projectId, task.ownerId, task.check, result.status, result.output);
    await updateProjectTask(task, result.status === 'unavailable' ? 'failed' : result.status === 'cancelled' ? 'cancelled' : 'completed',
      `${task.check} sandbox check ${result.status}: ${result.output}`);
  } catch (error) {
    await updateProjectTask(task, 'failed', error instanceof Error ? error.message : 'Sandbox check failed.');
  } finally {
    if (task.projectId && lock) await releaseProjectLock(task.projectId, task.ownerId, lock);
  }
}
