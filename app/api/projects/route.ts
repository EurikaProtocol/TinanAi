import { after, NextResponse } from 'next/server';
import { getRequestOwnerId } from '@/lib/auth';
import { getOpenAICompatibleConfig, getProviderMode, ProviderError } from '@/lib/agent/openai-provider';
import { allowRequest } from '@/lib/agent/task-store';
import { createProjectTask, getProjectForOwner, listProjects } from '@/lib/builder/project-store';
import { getProjectTemplate } from '@/lib/builder/templates';
import { runProjectPlanning } from '@/lib/builder/runner';

export const runtime = 'nodejs';
const maxBodyBytes = 16 * 1024;

export async function GET(request: Request) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  return NextResponse.json({ projects: await listProjects(ownerId), persistence: 'cloudflare-d1-r2' });
}

export async function POST(request: Request) {
  const ownerId = getRequestOwnerId(request);
  if (!ownerId) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  if (!allowRequest(`project-builder:${ownerId}`, Date.now(), 5)) {
    return NextResponse.json({ error: 'Too many project requests. Try again in a minute.' }, { status: 429 });
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBodyBytes) return NextResponse.json({ error: 'Requirements are too large.' }, { status: 413 });
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON and no larger than 16 KiB.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('requirements' in body) || typeof body.requirements !== 'string') {
    return NextResponse.json({ error: 'A natural-language requirements string is required.' }, { status: 400 });
  }
  const requirements = body.requirements.trim();
  if (!requirements) return NextResponse.json({ error: 'Describe the project requirements.' }, { status: 400 });
  if (requirements.length > 8000) return NextResponse.json({ error: 'Requirements must be 8,000 characters or fewer.' }, { status: 400 });
  if ('projectId' in body && (typeof body.projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.projectId))) {
    return NextResponse.json({ error: 'Project ID is invalid.' }, { status: 400 });
  }
  const templateId = 'templateId' in body ? body.templateId : undefined;
  if (templateId !== undefined && (typeof templateId !== 'string' || !getProjectTemplate(templateId))) {
    return NextResponse.json({ error: 'Template selection is invalid.' }, { status: 400 });
  }
  const template = typeof templateId === 'string' ? getProjectTemplate(templateId) : undefined;
  const planningRequirements = template
    ? `${requirements}\n\nSelected example template: ${template.name} (template id: ${templateId}). Use this as a structural and visual starting point, adapting it to the requirements above.`
    : requirements;
  if (planningRequirements.length > 8000) {
    return NextResponse.json({ error: 'Requirements and template context must be 8,000 characters or fewer.' }, { status: 400 });
  }
  try {
    if (getProviderMode() !== 'openai-compatible') {
      return NextResponse.json({ error: 'Project generation needs a real provider. Configure TINAN_AI_PROVIDER=openai-compatible, TINAN_AI_API_KEY, and TINAN_AI_MODEL.' }, { status: 503 });
    }
    getOpenAICompatibleConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ProviderError ? error.message : 'Provider configuration is unavailable.' },
      { status: 503 },
    );
  }

  if ('projectId' in body && !(await getProjectForOwner(body.projectId as string, ownerId))) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }
  const task = await createProjectTask(
    planningRequirements,
    ownerId,
    'generation',
    'projectId' in body ? body.projectId as string : null,
    null,
    'planning',
  );
  after(() => runProjectPlanning(task));
  return NextResponse.json({ task, persistence: 'cloudflare-d1-r2' }, { status: 202 });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      throw new Error('too-large');
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
