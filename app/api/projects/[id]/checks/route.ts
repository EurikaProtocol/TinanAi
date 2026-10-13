import { after, NextResponse } from 'next/server';
import { createProjectTask, getProject } from '@/lib/builder/project-store';
import { runProjectCheck } from '@/lib/builder/runner';

type Context = { params: Promise<{ id: string }> };
const checks = ['lint', 'typecheck', 'test', 'build'];

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!await getProject(id)) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('check' in body) || typeof body.check !== 'string' || !checks.includes(body.check)) {
    return NextResponse.json({ error: 'Select one of lint, typecheck, test, or build.' }, { status: 400 });
  }
  const task = createProjectTask('', 'check', id, body.check);
  after(() => runProjectCheck(task));
  return NextResponse.json({ task }, { status: 202 });
}
