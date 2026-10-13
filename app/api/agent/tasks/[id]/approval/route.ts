import { after, NextResponse } from 'next/server';
import { approveAndExecute } from '@/lib/agent/engine';
import { getRequestOwnerId } from '@/lib/auth';
import { getTaskForOwner, recordApproval } from '@/lib/agent/task-store';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const task = getTaskForOwner(id, ownerId);
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
    recordApproval(id, body.approved, ownerId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Approval could not be recorded.' }, { status: 409 });
  }
  if (body.approved) after(() => approveAndExecute(task));
  return NextResponse.json({ task });
}
