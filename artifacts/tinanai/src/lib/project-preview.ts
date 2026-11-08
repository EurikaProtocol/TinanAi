export interface PreviewProjectFile {
  path: string;
  content: string;
}

export function resolveLocalProjectPath(currentPath: string, source: string): string | null {
  const clean = source.split(/[?#]/, 1)[0] ?? "";
  if (!clean || /^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(clean)) return null;

  const parts = clean.startsWith("/") ? [] : currentPath.split("/").slice(0, -1);
  for (const part of clean.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

export function resolvePreviewPage(
  files: PreviewProjectFile[],
  currentPath: string,
  href: string,
): string | null {
  const path = resolveLocalProjectPath(currentPath, href);
  if (path === null) return null;

  const hrefPath = href.split(/[?#]/, 1)[0] ?? "";
  const candidates = !path
    ? ["index.html"]
    : hrefPath.endsWith("/")
      ? [`${path}/index.html`]
      : /\.html?$/i.test(path)
        ? [path]
        : [`${path}.html`, `${path}/index.html`];

  return candidates.find((candidate) =>
    files.some((file) => file.path === candidate && /\.html?$/i.test(file.path)),
  ) ?? null;
}
