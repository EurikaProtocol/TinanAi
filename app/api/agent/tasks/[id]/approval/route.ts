import { after, NextResponse } from 'next/server';
import { approveAndExecute } from '@/lib/agent/engine';
import { getTask, recordApproval } from '@/lib/agent/task-store';

type RouteContext = { params: { id: string } | Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('approved' in body) || typeof body.approved !== 'boolean') {
    return NextResponse.json({ error: 'An approved boolean is required.' }, { status: 400 });
  }
  try {
    recordApproval(id, body.approved);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Approval could not be recorded.' }, { status: 409 });
  }
  if (body.approved) after(() => approveAndExecute(task));
  return NextResponse.json({ task });
}
