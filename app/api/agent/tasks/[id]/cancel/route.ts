import { NextResponse } from 'next/server';
import { cancelTask } from '@/lib/agent/task-store';

type RouteContext = { params: { id: string } | Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = cancelTask(id);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (task.status !== 'cancelled') {
    return NextResponse.json({ error: `Task cannot be cancelled in state ${task.status}.` }, { status: 409 });
  }
  return NextResponse.json({ task });
}
