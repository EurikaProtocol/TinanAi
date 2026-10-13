const assert = require('node:assert/strict');
const { mkdtemp, rm, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDemoPlan, createTaskRecord, planTask } = require('../.test-build/engine.js');
const {
  createModelPlan,
  getOpenAICompatibleConfig,
  getProviderMode,
  ProviderError,
  validatePlan,
} = require('../.test-build/openai-provider.js');
const { allowRequest, cancelTask, createTask, getTask, recordApproval, transitionTask } = require('../.test-build/task-store.js');
const { executeTool, hasPermission } = require('../.test-build/tools.js');

const validEnv = {
  TINAN_AI_PROVIDER: 'openai-compatible',
  TINAN_AI_API_KEY: 'server-only-test-key',
  TINAN_AI_MODEL: 'test-model',
  TINAN_AI_BASE_URL: 'https://ai.example.test/v1',
};

test('demo is the explicit default and provider configuration requires server credentials', () => {
  assert.equal(getProviderMode({}), 'demo');
  assert.throws(() => getOpenAICompatibleConfig({}), ProviderError);
  assert.equal(getOpenAICompatibleConfig(validEnv).model, 'test-model');
  assert.throws(
    () => getOpenAICompatibleConfig({ ...validEnv, TINAN_AI_BASE_URL: 'http://remote.example/v1' }),
    ProviderError,
  );
});

test('provider returns a validated structured plan without exposing credentials', async () => {
  let sentAuthorization;
  const plan = {
    summary: 'Review the project.',
    requiresApproval: false,
    steps: [{ title: 'Inspect metadata', description: 'Read project facts.', permission: 'READ', tool: { name: 'project.info', arguments: {} } }],
  };
  const result = await createModelPlan(
    'Review the project',
    [],
    undefined,
    validEnv,
    async (_url, options) => {
      sentAuthorization = options.headers.Authorization;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 });
    },
  );
  assert.equal(result.steps[0].tool.name, 'project.info');
  assert.equal(sentAuthorization, 'Bearer ' + validEnv.TINAN_AI_API_KEY);
  assert.equal(JSON.stringify(result).includes(validEnv.TINAN_AI_API_KEY), false);
});

test('provider failures and invalid provider plans fail closed', async () => {
  await assert.rejects(
    createModelPlan('objective', [], undefined, validEnv, async () => new Response('', { status: 429 })),
    /rate limiting/,
  );
  assert.throws(
    () => validatePlan({ summary: 'bad', requiresApproval: false, steps: [{ title: 'run shell', description: '', permission: 'TEST', tool: { name: 'shell.exec', arguments: {} } }] }),
    /unsupported tool/,
  );
  assert.throws(
    () => validatePlan({ summary: 'bad', requiresApproval: false, steps: [{ title: 'deploy', description: '', permission: 'PRODUCTION', tool: null }] }),
    /must request approval/,
  );
  await assert.rejects(
    createModelPlan('objective', [], undefined, validEnv, async () => new Response('not json', { status: 200 })),
    /invalid response|invalid plan format/,
  );
});

test('provider requests enforce the configured timeout', async () => {
  await assert.rejects(
    createModelPlan(
      'objective',
      [],
      undefined,
      { ...validEnv, TINAN_AI_TIMEOUT_MS: '1000' },
      async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    ),
    /timed out/,
  );
});

test('tool permissions reject unregistered tools and require TEST for test proposals', async () => {
  assert.equal(hasPermission('READ', 'TEST'), false);
  const task = createTaskRecord('tool-test', 'propose checks', 'openai-compatible', []);
  const context = { task, workspaceRoot: process.cwd() };
  const rejected = await executeTool({ name: 'tests.propose', arguments: {} }, 'READ', context);
  const unknown = await executeTool({ name: 'shell.exec', arguments: {} }, 'FINANCIAL', context);
  const proposed = await executeTool({ name: 'tests.propose', arguments: {} }, 'TEST', context);
  assert.equal(rejected.status, 'rejected');
  assert.equal(unknown.status, 'rejected');
  assert.equal(proposed.status, 'completed');
  assert.equal(proposed.data.executed, false);
});

test('file reading requires explicit authorization and rejects traversal and symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tinan-agent-test-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'tinan-agent-outside-'));
  try {
    await writeFile(path.join(root, 'notes.txt'), 'authorized');
    await writeFile(path.join(outside, 'secret.txt'), 'not authorized');
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
    const task = createTaskRecord('file-test', 'read notes', 'openai-compatible', ['notes.txt', 'link.txt', '../secret.txt']);
    const context = { task, workspaceRoot: root };
    assert.equal((await executeTool({ name: 'files.read', arguments: { path: 'notes.txt' } }, 'READ', context)).status, 'completed');
    assert.equal((await executeTool({ name: 'files.read', arguments: { path: 'link.txt' } }, 'READ', context)).status, 'rejected');
    assert.equal((await executeTool({ name: 'files.read', arguments: { path: '../secret.txt' } }, 'READ', context)).status, 'rejected');
    task.authorizedPaths = [];
    assert.equal((await executeTool({ name: 'files.read', arguments: { path: 'notes.txt' } }, 'READ', context)).status, 'rejected');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('task state transitions reject invalid moves and support approval and cancellation', () => {
  const task = createTaskRecord('state-test', 'test transitions', 'demo', []);
  createTask(task);
  assert.equal(getTask(task.id).status, 'planning');
  transitionTask(task.id, 'awaiting_approval', 'Needs review.');
  recordApproval(task.id, true);
  transitionTask(task.id, 'executing', 'Approved.');
  transitionTask(task.id, 'completed', 'Finished.');
  assert.throws(() => transitionTask(task.id, 'executing', 'Invalid reversal.'), /Invalid task transition/);

  const cancelled = createTaskRecord('cancel-test', 'cancel me', 'demo', []);
  createTask(cancelled);
  assert.equal(cancelTask(cancelled.id).status, 'cancelled');
  assert.equal(getTask(cancelled.id).status, 'cancelled');
});

test('process-local task rate limiter rejects bursts and expires old requests', () => {
  const key = `rate-test-${Date.now()}`;
  for (let index = 0; index < 20; index += 1) {
    assert.equal(allowRequest(key, 1000), true);
  }
  assert.equal(allowRequest(key, 1000), false);
  assert.equal(allowRequest(key, 62_000), true);
});

test('demo planning never selects tools and identifies sensitive goals', async () => {
  const safePlan = createDemoPlan('Organize a project');
  const task = createTaskRecord('demo-test', 'Plan a mainnet deployment', 'demo', []);
  createTask(task);
  await planTask(task);
  assert.equal(safePlan.steps.every((step) => step.tool === null), true);
  assert.equal(task.status, 'awaiting_approval');
  assert.equal(task.simulated, true);
  assert.equal(task.selectedTools.length, 0);
});
