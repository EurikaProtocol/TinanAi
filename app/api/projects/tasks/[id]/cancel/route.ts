import { NextResponse } from 'next/server';
import { cancelProjectTask } from '@/lib/builder/project-store';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const task = cancelProjectTask(id);
  if (!task) return NextResponse.json({ error: 'Project task not found.' }, { status: 404 });
  if (task.status !== 'cancelled') return NextResponse.json({ error: 'Task is no longer cancellable.' }, { status: 409 });
  return NextResponse.json({ task });
}
