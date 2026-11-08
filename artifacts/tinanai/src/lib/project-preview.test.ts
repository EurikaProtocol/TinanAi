import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires explicit .ts extensions.
import { resolveLocalProjectPath, resolvePreviewPage } from "./project-preview.ts";

const files = [
  { path: "index.html", content: "<main>home</main>" },
  { path: "about.html", content: "<main>about</main>" },
  { path: "docs/index.html", content: "<main>docs</main>" },
];

describe("static project preview navigation", () => {
  it("resolves local page links and ignores query strings and fragments", () => {
    assert.equal(resolvePreviewPage(files, "index.html", "about.html?tab=team#people"), "about.html");
    assert.equal(resolvePreviewPage(files, "index.html", "/about"), "about.html");
    assert.equal(resolvePreviewPage(files, "index.html", "/docs/"), "docs/index.html");
  });

  it("resolves relative links from the active nested page", () => {
    assert.equal(resolveLocalProjectPath("docs/index.html", "../about.html"), "about.html");
    assert.equal(resolvePreviewPage(files, "docs/index.html", "../about"), "about.html");
  });

  it("blocks external, unsupported, and project-escaping links", () => {
    assert.equal(resolvePreviewPage(files, "index.html", "https://example.com"), null);
    assert.equal(resolvePreviewPage(files, "index.html", "//example.com"), null);
    assert.equal(resolvePreviewPage(files, "index.html", "../outside.html"), null);
    assert.equal(resolvePreviewPage(files, "index.html", "missing.html"), null);
  });

  it("maps the project root to its entry page", () => {
    assert.equal(resolvePreviewPage(files, "about.html", "/"), "index.html");
  });
});
