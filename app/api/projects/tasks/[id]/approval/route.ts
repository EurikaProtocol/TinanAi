import { after, NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { approveProjectTask, cancelProjectTask, getProjectTaskForOwner } from '@/lib/builder/project-store';
import { runProjectGeneration } from '@/lib/builder/runner';

type Context = { params: Promise<{ id: string }> };
const maxBodyBytes = 1024;

export async function POST(request: Request, context: Context) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON and no larger than 1 KiB.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('approved' in body) || typeof body.approved !== 'boolean') {
    return NextResponse.json({ error: 'An approved boolean is required.' }, { status: 400 });
  }
  const { id } = await context.params;
  const current = await getProjectTaskForOwner(id, ownerId);
  if (!current) return NextResponse.json({ error: 'Project task not found.' }, { status: 404 });
  if (current.status !== 'awaiting_approval') {
    return NextResponse.json({ error: 'This project plan is no longer awaiting approval.' }, { status: 409 });
  }
  if (!body.approved) {
    const task = await cancelProjectTask(id, ownerId);
    return NextResponse.json({ task });
  }
  const task = await approveProjectTask(id, ownerId);
  if (!task || task.status !== 'generating') {
    return NextResponse.json({ error: 'Project plan approval could not be recorded.' }, { status: 409 });
  }
  after(() => runProjectGeneration(task));
  return NextResponse.json({ task }, { status: 202 });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBodyBytes || !request.body) throw new Error('invalid body size');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      throw new Error('invalid body size');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
