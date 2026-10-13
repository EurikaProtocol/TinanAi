import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { getProjectTaskForOwner } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const task = getProjectTaskForOwner(id, ownerId);
  if (!task) return NextResponse.json({ error: 'Project task not found in this server process.' }, { status: 404 });
  return NextResponse.json({ task });
}
