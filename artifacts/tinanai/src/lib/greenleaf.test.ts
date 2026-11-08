import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error The Node native TypeScript test runner requires explicit .ts extensions.
import { greenLeafCommandReply, parseGreenLeafCommand } from "./greenleaf.ts";

describe("Green Leaf chat commands", () => {
  it("enables with the bare command or on, including surrounding whitespace", () => {
    assert.equal(parseGreenLeafCommand("/greenleaf"), "on");
    assert.equal(parseGreenLeafCommand("  /greenleaf  "), "on");
    assert.equal(parseGreenLeafCommand("/greenleaf on"), "on");
  });

  it("parses commands case-insensitively", () => {
    assert.equal(parseGreenLeafCommand("/GREENLEAF ON"), "on");
    assert.equal(parseGreenLeafCommand("/GreenLeaf Off"), "off");
    assert.equal(parseGreenLeafCommand("/greenleaf STATUS"), "status");
    assert.equal(parseGreenLeafCommand("/GREENLEAF help"), "help");
  });

  it("recognizes off, status, and help as standalone commands", () => {
    assert.equal(parseGreenLeafCommand("/greenleaf off"), "off");
    assert.equal(parseGreenLeafCommand("/greenleaf status"), "status");
    assert.equal(parseGreenLeafCommand("/greenleaf help"), "help");
  });

  it("does not trigger on prose, quotes, code blocks, or extra command text", () => {
    for (const text of [
      "Please type /greenleaf",
      '" /greenleaf "',
      "```/greenleaf```",
      "```text\n/greenleaf\n```",
      "/greenleaf on please",
      "/greenleaf status extra",
    ]) {
      assert.equal(parseGreenLeafCommand(text), null, text);
    }
  });

  it("returns useful state and usage details without exposing system instructions", () => {
    assert.match(greenLeafCommandReply("status", true), /active/i);
    assert.match(greenLeafCommandReply("status", false), /inactive/i);
    const help = greenLeafCommandReply("help", false);
    assert.match(help, /\/greenleaf off/);
    assert.match(help, /safety rules remain in effect/i);
    assert.doesNotMatch(help, /Green Leaf Mode is an additional reasoning/);
  });
});
