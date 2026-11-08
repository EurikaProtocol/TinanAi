export type BuilderSourceFile = {
  path: string;
  content: string;
  mediaType?: string;
};

export type BuilderFileChange = {
  path: string;
  kind: 'added' | 'updated' | 'removed';
  before: BuilderSourceFile | null;
  after: BuilderSourceFile | null;
};

export function compareBuilderFiles(
  currentFiles: BuilderSourceFile[],
  proposedFiles: BuilderSourceFile[],
): BuilderFileChange[] {
  const current = new Map(currentFiles.map((file) => [file.path, file]));
  const proposed = new Map(proposedFiles.map((file) => [file.path, file]));
  const paths = [...new Set([...current.keys(), ...proposed.keys()])].sort((a, b) => a.localeCompare(b));

  return paths.flatMap((path) => {
    const before = current.get(path) ?? null;
    const after = proposed.get(path) ?? null;
    if (before && after && before.content === after.content && before.mediaType === after.mediaType) return [];
    return [{
      path,
      kind: !before ? 'added' as const : !after ? 'removed' as const : 'updated' as const,
      before,
      after,
    }];
  });
}
