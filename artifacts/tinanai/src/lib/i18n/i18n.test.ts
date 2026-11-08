import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's native TypeScript runner loads source files with explicit extensions.
import { localeDirection, localeFromStorage, locales } from "./locales.ts";
// @ts-expect-error Node's native TypeScript runner loads source files with explicit extensions.
import { localeMessages, uiKeys } from "./catalog.ts";

describe("TINANAI locale catalog", () => {
  it("exposes English as the only interface language", () => {
    assert.deepEqual(locales.map((locale) => locale.code), ["en"]);
    assert.equal(locales[0]?.name, "English");
  });

  it("always uses English, including when an old saved locale remains", () => {
    assert.equal(localeFromStorage(null), "en");
    assert.equal(localeFromStorage("lt"), "en");
    assert.equal(localeFromStorage("xx"), "en");
    assert.equal(localeFromStorage("en"), "en");
  });

  it("keeps every English catalog entry intact", () => {
    assert.equal(localeMessages.en.length, uiKeys.length);
    localeMessages.en.forEach((text, index) => {
      assert.equal(text, uiKeys[index]);
      assert.ok(text.trim().length > 0);
    });
  });

  it("preserves English formatting placeholders", () => {
    const placeholderPattern = /\{[^{}]+\}/g;
    uiKeys.forEach((key, index) => {
      const source = key.match(placeholderPattern) ?? [];
      const translated = localeMessages.en[index].match(placeholderPattern) ?? [];
      assert.deepEqual(translated.sort(), [...source].sort(), `en:${key}`);
    });
  });

  it("uses left-to-right layout for English", () => {
    assert.equal(localeDirection("en"), "ltr");
  });
});
