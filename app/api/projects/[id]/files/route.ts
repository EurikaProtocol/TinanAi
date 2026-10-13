import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { getProjectForOwner, readProjectFile } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectForOwner(id, ownerId);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const relative = new URL(request.url).searchParams.get('path');
  if (!relative || !project.files.includes(relative)) return NextResponse.json({ error: 'Project file not found.' }, { status: 404 });
  try {
    return NextResponse.json({ path: relative, content: await readProjectFile(id, relative, ownerId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read project file.' }, { status: 400 });
  }
}
