import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TinanaiBuilderProjectFile } from "@workspace/api-zod";
import { validateBuilderProjectFiles } from "./builder-project-validation.ts";
import { redactBuilderText } from "./builder-files.ts";

const validate = (files: TinanaiBuilderProjectFile[]) =>
  validateBuilderProjectFiles(files, redactBuilderText);

const htmlFile = (content = "<!doctype html><title>Local app</title>"): TinanaiBuilderProjectFile => ({
  path: "index.html",
  content,
  mediaType: "text/html",
});

describe("Builder project file validation", () => {
  it("normalizes media types and accepts bounded multi-file static projects", () => {
    const files = validate([
      htmlFile(),
      { path: "assets/site.css", content: "body { color: navy; }", mediaType: "anything" },
    ]);
    assert.equal(files.length, 2);
    assert.equal(files[1]?.mediaType, "text/css");
  });

  it("rejects traversal, environment files, duplicate paths, and missing entry points", () => {
    assert.throws(
      () => validate([{ ...htmlFile(), path: "../index.html" }]),
      /relative|traversal/,
    );
    assert.throws(
      () => validate([{ ...htmlFile(), path: ".env" }]),
      /environment files/,
    );
    assert.throws(
      () => validate([htmlFile(), htmlFile("<p>second</p>")]),
      /unique paths/,
    );
    assert.throws(
      () => validate([{ ...htmlFile(), path: "readme.md" }]),
      /include index.html/,
    );
  });

  it("rejects secret-like values and files exceeding the project storage limit", () => {
    assert.throws(
      () => validate([
        htmlFile("apiKey=sk-proj-abcdefghijklmnopqrstuvwxyz123456"),
      ]),
      /secret-like values/,
    );
    assert.throws(
      () => validate([htmlFile("x".repeat(2 * 1024 * 1024 + 1))]),
      /2 MB/,
    );
  });
});
