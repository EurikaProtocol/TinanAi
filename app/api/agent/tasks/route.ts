import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { createTaskRecord, planTask } from '@/lib/agent/engine';
import { getOpenAICompatibleConfig, getProviderMode, ProviderError } from '@/lib/agent/openai-provider';
import { allowRequest, createTask } from '@/lib/agent/task-store';

export const runtime = 'nodejs';
const MAX_OBJECTIVE_LENGTH = 2000;
const MAX_BODY_BYTES = 16 * 1024;

export async function GET() {
  let provider: 'demo' | 'openai-compatible';
  let providerConfigured = true;
  try {
    provider = getProviderMode();
    if (provider === 'openai-compatible') getOpenAICompatibleConfig();
  } catch {
    provider = 'demo';
    providerConfigured = false;
  }
  return NextResponse.json({ provider, providerConfigured, persistence: 'process-memory' });
}

export async function POST(request: Request) {
  if (!allowRequest('process-global')) {
    return NextResponse.json({ error: 'Too many task requests. Try again in a minute.' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'body-too-large';
    return NextResponse.json(
      { error: tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.' },
      { status: tooLarge ? 413 : 400 },
    );
  }
  if (typeof body !== 'object' || body === null ||
      !('objective' in body) || typeof body.objective !== 'string') {
    return NextResponse.json({ error: 'An objective string is required.' }, { status: 400 });
  }

  const objective = body.objective.trim();
  if (!objective) return NextResponse.json({ error: 'Please describe an objective.' }, { status: 400 });
  if (objective.length > MAX_OBJECTIVE_LENGTH) {
    return NextResponse.json({ error: `Objectives must be ${MAX_OBJECTIVE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  let provider: 'demo' | 'openai-compatible';
  try {
    provider = getProviderMode();
    if (provider === 'openai-compatible') getOpenAICompatibleConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ProviderError ? error.message : 'Provider configuration is invalid.' },
      { status: 503 },
    );
  }

  const requestedPaths = 'authorizedPaths' in body && Array.isArray(body.authorizedPaths)
    ? body.authorizedPaths.filter((value): value is string => typeof value === 'string' && value.length <= 300).slice(0, 8)
    : [];
  const authorizedPaths = process.env.TINAN_ENABLE_FILE_READING === 'true' ? requestedPaths : [];
  const task = createTaskRecord(randomUUID(), objective, provider, authorizedPaths);
  createTask(task);

  after(() => planTask(task));
  return NextResponse.json(
    { provider, simulated: provider === 'demo', task, persistence: 'process-memory' },
    { status: 202 },
  );
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('invalid-json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('body-too-large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
