import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createDemoTask } from '@/lib/agent/demo-planner';

const MAX_OBJECTIVE_LENGTH = 2000;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('objective' in body) ||
    typeof body.objective !== 'string'
  ) {
    return NextResponse.json({ error: 'An objective string is required.' }, { status: 400 });
  }

  const objective = body.objective.trim();

  if (!objective) {
    return NextResponse.json({ error: 'Please describe an objective.' }, { status: 400 });
  }

  if (objective.length > MAX_OBJECTIVE_LENGTH) {
    return NextResponse.json(
      { error: `Objectives must be ${MAX_OBJECTIVE_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const task = createDemoTask(objective, randomUUID(), new Date().toISOString());
  return NextResponse.json({ provider: 'demo', simulated: true, task });
}
