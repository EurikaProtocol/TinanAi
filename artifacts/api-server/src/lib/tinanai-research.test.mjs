import assert from "node:assert/strict";
import test from "node:test";
import { extractResearchSources } from "./tinanai-research.ts";

test("extracts unique HTTPS citations from assistant output annotations", () => {
  const output = [
    {
      type: "message",
      content: [{
        type: "output_text",
        text: "An answer with citations.",
        annotations: [
          { type: "url_citation", title: "  Official docs\n Reference  ", url: "https://docs.example.dev/guide" },
          { type: "url_citation", title: "Duplicate", url: "https://docs.example.dev/guide" },
          { type: "url_citation", title: "Unsafe scheme", url: "javascript:alert(1)" },
          { type: "url_citation", title: "Credential URL", url: "https://user:pass@example.dev/page" },
          { type: "file_citation", title: "Not a web citation", url: "https://example.dev/file" },
        ],
      }],
    },
  ];

  assert.deepEqual(extractResearchSources(output), [
    { title: "Official docs Reference", url: "https://docs.example.dev/guide" },
  ]);
});

test("ignores malformed output and limits the source list", () => {
  assert.deepEqual(extractResearchSources(null), []);
  const annotations = Array.from({ length: 15 }, (_, index) => ({
    type: "url_citation",
    title: `Source ${index}`,
    url: `https://example.dev/${index}`,
  }));

  const result = extractResearchSources([
    { type: "message", content: [{ type: "output_text", annotations }] },
  ]);
  assert.equal(result.length, 12);
});
