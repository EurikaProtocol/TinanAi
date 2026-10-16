export type ProjectTaskStatus =
  | 'planning'
  | 'awaiting_approval'
  | 'generating'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function isActiveProjectTaskStatus(status: ProjectTaskStatus): boolean {
  return status === 'planning' || status === 'awaiting_approval' ||
    status === 'generating' || status === 'committing';
}

export function isCancellableProjectTaskStatus(status: ProjectTaskStatus): boolean {
  return status === 'planning' || status === 'awaiting_approval' || status === 'generating';
}
