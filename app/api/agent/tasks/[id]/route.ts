import { NextResponse } from 'next/server';
import { getTask } from '@/lib/agent/task-store';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Task not found in this server process.' }, { status: 404 });
  return NextResponse.json({ task, persistence: 'process-memory' });
}
