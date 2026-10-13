const assert = require('node:assert/strict');
const { mkdtemp, rm, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDemoPlan, createTaskRecord, planTask } = require('../.test-build/lib/agent/engine.js');
const {
  createModelPlan,
  getOpenAICompatibleConfig,
  getProviderMode,
  ProviderError,
  validatePlan,
} = require('../.test-build/lib/agent/openai-provider.js');
const { allowRequest, cancelTask, createTask, getTask, recordApproval, transitionTask } = require('../.test-build/lib/agent/task-store.js');
const { executeTool, hasPermission } = require('../.test-build/lib/agent/tools.js');
const {
  createProject,
  createProjectTask,
  getProject,
  readProjectFile,
  rollbackProject,
  validateRelativeProjectPath,
  writeGeneratedFiles,
} = require('../.test-build/lib/builder/project-store.js');
const { createProjectArchive } = require('../.test-build/lib/builder/archive.js');
const { runProjectGeneration } = require('../.test-build/lib/builder/runner.js');
const { runSandboxCheck } = require('../.test-build/lib/builder/sandbox.js');
const { gunzipSync } = require('node:zlib');

const validEnv = {
  TINAN_AI_PROVIDER: 'openai-compatible',
  TINAN_AI_API_KEY: 'server-only-test-key',
  TINAN_AI_MODEL: 'test-model',
  TINAN_AI_BASE_URL: 'https://ai.example.test/v1',
};
const generatedProject = {
  name: 'Sample Project',
  specification: 'A small generated project.',
  technology: ['Node.js', 'TypeScript'],
  tasks: ['Add a greeting module'],
  files: [{ path: 'src/index.ts', content: 'export const greeting = "hello";\n' }],
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

test('generated project paths reject traversal, hidden files, and duplicate paths', () => {
  assert.equal(validateRelativeProjectPath('src/index.ts'), 'src/index.ts');
  for (const candidate of ['../escape.ts', '/absolute.ts', '.env', 'src/.secret', 'src/../../escape', 'src/key.pem']) {
    assert.throws(() => validateRelativeProjectPath(candidate), /not permitted/);
  }
  assert.throws(() => validatePlan({}), ProviderError);
  const { validateGeneratedProject } = require('../.test-build/lib/agent/openai-provider.js');
  assert.throws(() => validateGeneratedProject({
    ...generatedProject,
    files: [{ path: 'src/a.ts', content: 'a' }, { path: 'src/a.ts', content: 'b' }],
  }), /duplicate/);
});

test('project workspaces are isolated, readable, exportable, and rollback generated updates', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tinan-project-test-'));
  const previousRoot = process.env.TINAN_PROJECTS_DIR;
  process.env.TINAN_PROJECTS_DIR = root;
  try {
    const first = await createProject(generatedProject);
    const second = await createProject({ ...generatedProject, name: 'Another Project', files: [{ path: 'src/index.ts', content: 'other\n' }] });
    assert.notEqual(first.id, second.id);
    assert.equal(await readProjectFile(first.id, 'src/index.ts'), generatedProject.files[0].content);
    assert.equal(await readProjectFile(second.id, 'src/index.ts'), 'other\n');
    await assert.rejects(readProjectFile(first.id, '../package.json'), /not permitted/);

    await writeGeneratedFiles(first.id, {
      ...generatedProject,
      files: [{ path: 'src/index.ts', content: 'export const greeting = "updated";\n' }, { path: 'README.md', content: '# Sample\n' }],
    });
    assert.match(await readProjectFile(first.id, 'src/index.ts'), /updated/);
    const rolledBack = await rollbackProject(first.id);
    assert.deepEqual(rolledBack.files, ['src/index.ts']);
    assert.equal(await readProjectFile(first.id, 'src/index.ts'), generatedProject.files[0].content);

    const exported = createProjectArchive(await (async () => {
      const content = await readProjectFile(first.id, 'src/index.ts');
      return [{ path: 'src/index.ts', content: Buffer.from(content) }];
    })());
    assert.match(gunzipSync(exported).toString('utf8'), /export const greeting/);
  } finally {
    if (previousRoot === undefined) delete process.env.TINAN_PROJECTS_DIR;
    else process.env.TINAN_PROJECTS_DIR = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('project generation uses the configured provider, reports failure, and supports cancellation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tinan-builder-runner-'));
  const previous = {
    root: process.env.TINAN_PROJECTS_DIR,
    provider: process.env.TINAN_AI_PROVIDER,
    key: process.env.TINAN_AI_API_KEY,
    model: process.env.TINAN_AI_MODEL,
  };
  process.env.TINAN_PROJECTS_DIR = root;
  process.env.TINAN_AI_PROVIDER = 'openai-compatible';
  process.env.TINAN_AI_API_KEY = 'server-test-key';
  process.env.TINAN_AI_MODEL = 'test-model';
  try {
    const task = createProjectTask('Create a starter', 'generation');
    await runProjectGeneration(task, async () => generatedProject);
    assert.equal(task.status, 'completed');
    assert.ok(task.projectId);
    assert.equal((await getProject(task.projectId)).files.length, 1);

    const failed = createProjectTask('fail generation', 'generation');
    await runProjectGeneration(failed, async () => { throw new Error('Provider unavailable.'); });
    assert.equal(failed.status, 'failed');
    assert.match(failed.errors[0], /Provider unavailable/);

    const cancelled = createProjectTask('cancel generation', 'generation');
    const pending = runProjectGeneration(cancelled, (_requirements, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const { cancelProjectTask } = require('../.test-build/lib/builder/project-store.js');
    cancelProjectTask(cancelled.id);
    await pending;
    assert.equal(cancelled.status, 'cancelled');
  } finally {
    for (const [key, value] of Object.entries({
      TINAN_PROJECTS_DIR: previous.root,
      TINAN_AI_PROVIDER: previous.provider,
      TINAN_AI_API_KEY: previous.key,
      TINAN_AI_MODEL: previous.model,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('sandbox never falls back to host commands when Docker image is not digest-pinned', async () => {
  const task = createProjectTask('', 'check');
  const previousImage = process.env.TINAN_SANDBOX_IMAGE;
  delete process.env.TINAN_SANDBOX_IMAGE;
  try {
    const result = await runSandboxCheck('00000000-0000-4000-8000-000000000000', task, 'build', new AbortController().signal);
    assert.equal(result.status, 'unavailable');
    assert.match(result.output, /digest-pinned/);
  } finally {
    if (previousImage === undefined) delete process.env.TINAN_SANDBOX_IMAGE;
    else process.env.TINAN_SANDBOX_IMAGE = previousImage;
  }
});
