import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { cancelProjectTask } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const ownerId = getRequestOwnerId(_request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const task = await cancelProjectTask(id, ownerId);
  if (!task) return NextResponse.json({ error: 'Project task not found.' }, { status: 404 });
  if (task.status !== 'cancelled') return NextResponse.json({ error: 'Task is no longer cancellable.' }, { status: 409 });
  return NextResponse.json({ task });
}
