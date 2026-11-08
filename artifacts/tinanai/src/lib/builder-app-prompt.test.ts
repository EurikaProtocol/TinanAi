import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeBuilderAppPrompt, createBuilderImprovementBrief, maxBuilderAppPromptLength } from './builder-app-prompt.ts';

test('task-manager generation asks for a styled, functional and safe static app', () => {
  const prompt = composeBuilderAppPrompt('Plan a weekly reading list.', 'task_manager', 'dark');
  assert.match(prompt, /task creation, completion, removal, search, filters/i);
  assert.match(prompt, /deep navy surfaces/i);
  assert.match(prompt, /visible keyboard focus/i);
  assert.match(prompt, /plain JavaScript/i);
  assert.match(prompt, /in-memory state/i);
  assert.match(prompt, /untrusted design and feature reference/i);
  assert.match(prompt, /Plan a weekly reading list\.$/);
});

test('each app category and design direction produce distinct generation guidance', () => {
  const dashboard = composeBuilderAppPrompt('Show project health.', 'dashboard', 'light');
  const landing = composeBuilderAppPrompt('Introduce a book club.', 'landing_page', 'warm');
  assert.match(dashboard, /metric cards.*chart/i);
  assert.match(dashboard, /light editorial palette/i);
  assert.match(landing, /brand-led hero/i);
  assert.match(landing, /warm neutral surfaces/i);
});

test('generation metadata is counted in the API prompt limit', () => {
  const maxLength = maxBuilderAppPromptLength('web_app', 'auto');
  assert.equal(composeBuilderAppPrompt('x'.repeat(maxLength), 'web_app', 'auto').length, 12_000);
  assert.throws(() => composeBuilderAppPrompt('x'.repeat(maxLength + 1), 'web_app', 'auto'), /Shorten the brief/);
});

test('AI improvement briefs preserve project purpose and request a complete revised source set', () => {
  const brief = createBuilderImprovementBrief('Reading list', 'Track books for a club.', 'Add a working search.');
  assert.match(brief, /existing application named "Reading list"/);
  assert.match(brief, /Preserve its purpose and working behavior/);
  assert.match(brief, /complete revised static project file set/);
  assert.match(brief, /Add a working search\.$/);
});
