import { after, NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { allowRequest } from '@/lib/agent/task-store';
import { countRunningChecks, createProjectTask, getProjectForOwner } from '@/lib/builder/project-store';
import { runProjectCheck } from '@/lib/builder/runner';

type Context = { params: Promise<{ id: string }> };
const checks = ['lint', 'typecheck', 'test', 'build'];

export async function POST(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  if (!await getProjectForOwner(id, ownerId)) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (!allowRequest(`project-checks:${ownerId}`) || countRunningChecks(ownerId) >= 2) {
    return NextResponse.json({ error: 'Sandbox check budget reached. Wait for a running check or try again later.' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('check' in body) || typeof body.check !== 'string' || !checks.includes(body.check)) {
    return NextResponse.json({ error: 'Select one of lint, typecheck, test, or build.' }, { status: 400 });
  }
  const task = createProjectTask('', ownerId, 'check', id, body.check);
  after(() => runProjectCheck(task));
  return NextResponse.json({ task }, { status: 202 });
}
