import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { getProjectForOwner } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const ownerId = getRequestOwnerId(_request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectForOwner(id, ownerId);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ project });
}
