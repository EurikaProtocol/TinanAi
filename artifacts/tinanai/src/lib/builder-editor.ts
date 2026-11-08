export type BuilderEditorFile = {
  path: string;
  content: string;
  mediaType: string;
};

export type BuilderProjectSignatureInput = {
  name: string;
  description: string;
  appType: string;
  template: string;
  files: readonly BuilderEditorFile[];
};

export type RenameBuilderFileResult =
  | { ok: true; files: BuilderEditorFile[]; path: string }
  | { ok: false; reason: 'missing-file' | 'entry-file' | 'unsafe-path' | 'duplicate-path' };

export function isSafeBuilderFilePath(value: string): boolean {
  const parts = value.split('/');
  return value.length > 0 && value.length <= 240 && value === value.trim() &&
    !value.startsWith('/') && !value.includes('\\') && !/^[a-z]:/i.test(value) &&
    !parts.some((part) => !part || part === '.' || part === '..' || ['node_modules', '.git'].includes(part.toLowerCase())) &&
    !/^\.env(?:\.|$)/i.test(parts.at(-1) ?? '');
}

export function renameBuilderFile(
  files: readonly BuilderEditorFile[],
  oldPath: string,
  nextPath: string,
): RenameBuilderFileResult {
  if (!files.some((file) => file.path === oldPath)) return { ok: false, reason: 'missing-file' };
  if (oldPath === 'index.html') return { ok: false, reason: 'entry-file' };
  if (!isSafeBuilderFilePath(nextPath)) return { ok: false, reason: 'unsafe-path' };
  if (files.some((file) => file.path === nextPath && file.path !== oldPath)) {
    return { ok: false, reason: 'duplicate-path' };
  }
  if (oldPath === nextPath) return { ok: true, files: [...files], path: nextPath };
  return {
    ok: true,
    files: files.map((file) => file.path === oldPath ? { ...file, path: nextPath } : file),
    path: nextPath,
  };
}

export function countLiteralMatches(source: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(search, cursor)) !== -1) {
    count += 1;
    cursor += search.length;
  }
  return count;
}

export function replaceLiteral(source: string, search: string, replacement: string): string {
  return search ? source.split(search).join(replacement) : source;
}

export function builderProjectSignature(project: BuilderProjectSignatureInput): string {
  return JSON.stringify({
    name: project.name,
    description: project.description,
    appType: project.appType,
    template: project.template,
    files: project.files.map((file) => ({
      path: file.path,
      content: file.content,
      mediaType: file.mediaType,
    })),
  });
}
