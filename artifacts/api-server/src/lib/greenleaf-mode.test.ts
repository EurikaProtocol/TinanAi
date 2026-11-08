import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantInstructions } from "./tinanai-prompts.ts";
import { getAssistantInstructions, greenLeafInstructions, greenLeafMode } from "./greenleaf-mode.ts";

describe("Green Leaf instruction assembly", () => {
  it("exposes a stable mode identity", () => {
    assert.equal(greenLeafMode.id, "greenleaf");
    assert.equal(greenLeafMode.displayName, "Žaliasis Lapas / Green Leaf");
    assert.ok(greenLeafMode.version);
  });

  it("preserves the base chat instructions and appends the profile only when enabled", () => {
    const enabled = getAssistantInstructions("chat", true);
    assert.ok(enabled.startsWith(assistantInstructions.chat));
    assert.ok(enabled.includes(greenLeafInstructions));
    assert.equal(getAssistantInstructions("chat", false), assistantInstructions.chat);
    assert.equal(getAssistantInstructions("chat"), assistantInstructions.chat);
  });

  it("never adds the profile to other assistant modes", () => {
    assert.equal(getAssistantInstructions("document", true), assistantInstructions.document);
    assert.equal(getAssistantInstructions("builder", true), assistantInstructions.builder);
    assert.equal(getAssistantInstructions("tokenization", true), assistantInstructions.tokenization);
  });

  it("keeps speculation, verification, market uncertainty, and safety explicit", () => {
    assert.match(greenLeafInstructions, /speculative claims as established facts/i);
    assert.match(greenLeafInstructions, /Do not invent deployments/i);
    assert.match(greenLeafInstructions, /Never fabricate live prices/i);
    assert.match(greenLeafInstructions, /does not change safety rules/i);
  });
});
