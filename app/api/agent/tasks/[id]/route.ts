import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { getTaskForOwner } from '@/lib/agent/task-store';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const task = await getTaskForOwner(id, ownerId);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  return NextResponse.json({ task, persistence: 'cloudflare-d1' });
}
