import { NextResponse } from 'next/server';
import { getProjectTask } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const task = getProjectTask(id);
  if (!task) return NextResponse.json({ error: 'Project task not found in this server process.' }, { status: 404 });
  return NextResponse.json({ task });
}

