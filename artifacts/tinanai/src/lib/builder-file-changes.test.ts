import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareBuilderFiles } from './builder-file-changes.ts';

test('compares proposed source and reports added, updated, and removed files', () => {
  const changes = compareBuilderFiles(
    [
      { path: 'index.html', content: '<main>Old</main>', mediaType: 'text/html' },
      { path: 'app.js', content: 'console.info("old")', mediaType: 'text/javascript' },
      { path: 'legacy.css', content: '.old{}', mediaType: 'text/css' },
    ],
    [
      { path: 'index.html', content: '<main>New</main>', mediaType: 'text/html' },
      { path: 'app.js', content: 'console.info("old")', mediaType: 'text/javascript' },
      { path: 'styles.css', content: '.new{}', mediaType: 'text/css' },
    ],
  );

  assert.deepEqual(changes.map(({ path, kind }) => ({ path, kind })), [
    { path: 'index.html', kind: 'updated' },
    { path: 'legacy.css', kind: 'removed' },
    { path: 'styles.css', kind: 'added' },
  ]);
  assert.equal(changes[0]?.before?.content, '<main>Old</main>');
  assert.equal(changes[0]?.after?.content, '<main>New</main>');
});

test('does not report unchanged files', () => {
  const file = { path: 'index.html', content: '<main>Same</main>', mediaType: 'text/html' };
  assert.deepEqual(compareBuilderFiles([file], [{ ...file }]), []);
});
