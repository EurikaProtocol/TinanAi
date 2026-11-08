import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKnowledgeChunks, extractKnowledgeDocument, getKnowledgeFileFormat } from "./knowledge-files.ts";

describe("Knowledge document extraction", () => {
  it("accepts only the supported document extensions", () => {
    assert.equal(getKnowledgeFileFormat("paper.PDF"), "pdf");
    assert.equal(getKnowledgeFileFormat("notes.md"), "md");
    assert.equal(getKnowledgeFileFormat("contract.sol"), "code");
    assert.equal(getKnowledgeFileFormat("payload.exe"), null);
  });

  it("redacts credential-like text before returning chunks", async () => {
    const secret = "SuperSecretValue123";
    const text = `# Private configuration\n\nAPI_KEY=${secret}\n\nThe project uses isolated credentials.`;
    const extracted = await extractKnowledgeDocument(Buffer.from(text), "setup.md");
    const allText = extracted.segments.map((segment) => segment.text).join("\n");

    assert.equal(extracted.redacted, true);
    assert.match(allText, /\[REDACTED\]/);
    assert.doesNotMatch(allText, new RegExp(secret));
    assert.equal(extracted.segments[0]?.section, "Private configuration");
  });

  it("keeps page and section citations on size-limited overlapping chunks", () => {
    const chunks = createKnowledgeChunks([{
      text: "architecture detail ".repeat(900),
      pageStart: 11,
      pageEnd: 12,
      section: "System Architecture",
    }]);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.text.length <= 3_600));
    assert.ok(chunks.every((chunk) => chunk.pageStart === 11 && chunk.pageEnd === 12));
    assert.ok(chunks.every((chunk) => chunk.section === "System Architecture"));
    assert.deepEqual(chunks.map((chunk) => chunk.chunkIndex), chunks.map((_chunk, index) => index));
    assert.ok(chunks[1]?.text.includes(chunks[0]?.text.slice(-60) ?? ""));
  });

  it("rejects binary bytes passed to a text extractor", async () => {
    await assert.rejects(
      extractKnowledgeDocument(Buffer.from([0x41, 0x00, 0x42]), "notes.txt"),
      /binary data/,
    );
  });
});
