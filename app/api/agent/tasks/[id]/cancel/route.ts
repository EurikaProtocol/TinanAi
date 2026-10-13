import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { cancelTask } from '@/lib/agent/task-store';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const ownerId = getRequestOwnerId(_request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const task = cancelTask(id, ownerId);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (task.status !== 'cancelled') {
    return NextResponse.json({ error: `Task cannot be cancelled in state ${task.status}.` }, { status: 409 });
  }
  return NextResponse.json({ task });
}
