import path from "node:path";
import type { TinanaiBuilderProjectFile } from "@workspace/api-zod";

export const MAX_BUILDER_PROJECT_FILES = 20;
export const MAX_BUILDER_PROJECT_BYTES = 2 * 1024 * 1024;

export class BuilderProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuilderProjectValidationError";
  }
}

function normalizeProjectPath(filePath: string): string {
  if (
    !filePath ||
    filePath.length > 240 ||
    filePath !== filePath.trim() ||
    filePath.includes("\\") ||
    filePath.startsWith("/") ||
    /^[a-z]:/i.test(filePath)
  ) {
    throw new BuilderProjectValidationError("Project file paths must be relative and no longer than 240 characters.");
  }

  const normalized = path.posix.normalize(filePath);
  const segments = normalized.split("/");
  if (
    normalized !== filePath ||
    segments.some((part) => !part || part === "." || part === "..") ||
    segments.some((part) => part.toLowerCase() === "node_modules" || part.toLowerCase() === ".git") ||
    /^\.env(?:\.|$)/i.test(segments.at(-1) ?? "")
  ) {
    throw new BuilderProjectValidationError("Project file paths cannot contain traversal, environment files, or dependency folders.");
  }
  return normalized;
}

function mediaTypeFor(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".css") return "text/css";
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return "text/javascript";
  if (extension === ".json" || extension === ".webmanifest") return "application/json";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".md") return "text/markdown";
  if (extension === ".xml") return "application/xml";
  return "text/plain";
}

export function validateBuilderProjectFiles(
  input: TinanaiBuilderProjectFile[],
  redactText: (value: string) => { changed: boolean },
): TinanaiBuilderProjectFile[] {
  if (input.length < 1 || input.length > MAX_BUILDER_PROJECT_FILES) {
    throw new BuilderProjectValidationError(`A project must contain between 1 and ${MAX_BUILDER_PROJECT_FILES} files.`);
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files = input.map((file) => {
    const filePath = normalizeProjectPath(file.path);
    if (seen.has(filePath)) {
      throw new BuilderProjectValidationError("Project files must have unique paths.");
    }
    seen.add(filePath);

    const bytes = Buffer.byteLength(file.content, "utf8");
    totalBytes += bytes;
    if (bytes > MAX_BUILDER_PROJECT_BYTES || totalBytes > MAX_BUILDER_PROJECT_BYTES) {
      throw new BuilderProjectValidationError("Project files exceed the 2 MB total storage limit.");
    }

    if (redactText(file.content).changed) {
      throw new BuilderProjectValidationError(`Remove secret-like values from ${filePath} before saving.`);
    }

    return {
      path: filePath,
      content: file.content,
      mediaType: mediaTypeFor(filePath),
    };
  });

  if (!seen.has("index.html")) {
    throw new BuilderProjectValidationError("A supported project must include index.html.");
  }
  return files;
}
