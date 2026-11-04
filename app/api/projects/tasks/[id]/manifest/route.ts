import { NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { buildTaskManifest, ManifestError } from '@/lib/builder/manifest';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  try {
    return NextResponse.json({ manifest: await buildTaskManifest(id, ownerId) });
  } catch (error) {
    if (error instanceof ManifestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: 'Unable to build the project manifest.' }, { status: 400 });
  }
}
