import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { acquireProjectLock, getProjectForOwner, releaseProjectLock, rollbackProject } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  if (!await getProjectForOwner(id, ownerId)) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const lock = await acquireProjectLock(id, ownerId);
  if (!lock) return NextResponse.json({ error: 'Another project task is currently using this workspace.' }, { status: 409 });
  try {
    return NextResponse.json({ project: await rollbackProject(id, ownerId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project rollback failed.' }, { status: 409 });
  } finally {
    await releaseProjectLock(id, ownerId, lock);
  }
}
