import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { createProjectArchive } from '@/lib/builder/archive';
import { exportProjectFiles, getProjectForOwner } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  try {
    if (!await getProjectForOwner(id, ownerId)) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const project = await exportProjectFiles(id, ownerId);
    const archive = createProjectArchive(project.files);
    const safeName = project.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'project';
    return new Response(archive, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${safeName}.tar.gz"`,
        'Content-Length': String(archive.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project export failed.' }, { status: 404 });
  }
}
