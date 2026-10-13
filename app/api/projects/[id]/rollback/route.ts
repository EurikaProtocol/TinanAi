import { NextResponse } from 'next/server';
import { rollbackProject } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ project: await rollbackProject(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project rollback failed.' }, { status: 409 });
  }
}
