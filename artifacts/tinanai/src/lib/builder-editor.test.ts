import assert from 'node:assert/strict';
import test from 'node:test';
import {
  builderProjectSignature,
  countLiteralMatches,
  isSafeBuilderFilePath,
  renameBuilderFile,
  replaceLiteral,
} from './builder-editor.ts';

const files = [
  { path: 'index.html', content: '<link href="styles.css">', mediaType: 'text/html' },
  { path: 'styles.css', content: 'body { color: red; }', mediaType: 'text/css' },
];

test('builder file paths reject traversal and secret files', () => {
  assert.equal(isSafeBuilderFilePath('src/styles.css'), true);
  assert.equal(isSafeBuilderFilePath('../secret.txt'), false);
  assert.equal(isSafeBuilderFilePath('src/.env.local'), false);
  assert.equal(isSafeBuilderFilePath('C:/project/index.html'), false);
});

test('file rename preserves content and refuses the entry file', () => {
  const renamed = renameBuilderFile(files, 'styles.css', 'assets/theme.css');
  assert.equal(renamed.ok, true);
  if (renamed.ok) {
    assert.deepEqual(renamed.files[1], { ...files[1], path: 'assets/theme.css' });
    assert.equal(renamed.path, 'assets/theme.css');
  }
  assert.deepEqual(renameBuilderFile(files, 'index.html', 'main.html'), {
    ok: false,
    reason: 'entry-file',
  });
});

test('file rename refuses missing, unsafe, and duplicate paths', () => {
  assert.deepEqual(renameBuilderFile(files, 'missing.js', 'main.js'), {
    ok: false,
    reason: 'missing-file',
  });
  assert.deepEqual(renameBuilderFile(files, 'styles.css', '../theme.css'), {
    ok: false,
    reason: 'unsafe-path',
  });
  assert.deepEqual(renameBuilderFile(files, 'styles.css', 'index.html'), {
    ok: false,
    reason: 'duplicate-path',
  });
});

test('literal find and replace handles metacharacters without regular expressions', () => {
  assert.equal(countLiteralMatches('a+b a+b a-b', 'a+b'), 2);
  assert.equal(replaceLiteral('a+b a+b a-b', 'a+b', 'x'), 'x x a-b');
  assert.equal(replaceLiteral('unchanged', '', 'x'), 'unchanged');
});

test('project signatures change when persisted editor content changes', () => {
  const baseline = {
    name: 'Demo',
    description: 'Example',
    appType: 'web_app',
    template: 'blank',
    files,
  };
  assert.equal(builderProjectSignature(baseline), builderProjectSignature({ ...baseline, files }));
  assert.notEqual(
    builderProjectSignature(baseline),
    builderProjectSignature({ ...baseline, files: [{ ...files[1], path: 'theme.css' }] }),
  );
  assert.notEqual(
    builderProjectSignature(baseline),
    builderProjectSignature({ ...baseline, name: 'Renamed' }),
  );
});
