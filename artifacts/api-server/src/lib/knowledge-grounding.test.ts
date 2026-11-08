import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateKnowledgeModelAnswer } from "./knowledge-grounding.ts";
import type { KnowledgeSourceResult } from "./knowledge-service.ts";

const verifiedChunkId = "11111111-1111-4111-8111-111111111111";
const source: KnowledgeSourceResult = {
  chunkId: verifiedChunkId,
  documentId: "22222222-2222-4222-8222-222222222222",
  title: "Consensus notes",
  filename: "consensus.pdf",
  category: "ethereum_standards",
  pageStart: 14,
  pageEnd: 14,
  section: "Validators",
  excerpt: "Validators attest to blocks under the proof-of-stake protocol.",
  score: 0.88,
};

describe("Knowledge answer citation validation", () => {
  it("keeps citations only when their IDs were actually retrieved", () => {
    const payload = JSON.stringify({
      answer: "Validators attest to blocks.",
      citationIds: [verifiedChunkId, "33333333-3333-4333-8333-333333333333"],
      insufficientEvidence: false,
    });
    const grounded = validateKnowledgeModelAnswer(payload, [source]);

    assert.equal(grounded?.insufficientEvidence, false);
    assert.deepEqual(grounded?.citations, [source]);
  });

  it("refuses a model answer that cites only fabricated source IDs", () => {
    const payload = JSON.stringify({
      answer: "An unsupported claim.",
      citationIds: ["33333333-3333-4333-8333-333333333333"],
      insufficientEvidence: false,
    });
    const grounded = validateKnowledgeModelAnswer(payload, [source]);

    assert.equal(grounded?.insufficientEvidence, true);
    assert.deepEqual(grounded?.citations, []);
    assert.match(grounded?.answer ?? "", /couldn't verify/i);
  });

  it("rejects malformed model payloads", () => {
    assert.equal(validateKnowledgeModelAnswer("not JSON", [source]), null);
    assert.equal(
      validateKnowledgeModelAnswer(JSON.stringify({
        answer: "",
        citationIds: [],
        insufficientEvidence: false,
      }), [source]),
      null,
    );
  });

  it("uses a cautious answer when the model marks evidence insufficient", () => {
    const payload = JSON.stringify({
      answer: "I am uncertain.",
      citationIds: [verifiedChunkId],
      insufficientEvidence: true,
    });
    const grounded = validateKnowledgeModelAnswer(payload, [source]);

    assert.equal(grounded?.insufficientEvidence, true);
    assert.match(grounded?.answer ?? "", /couldn't verify/i);
  });
});
