import { NextResponse } from 'next/server';
import { createProjectArchive } from '@/lib/builder/archive';
import { exportProjectFiles } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const project = await exportProjectFiles(id);
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
