import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCorsOriginAllowed, parseCorsAllowedOrigins } from "./cors-origin.ts";

describe("credentialed CORS origin policy", () => {
  it("normalizes and allows only explicitly configured origins", () => {
    const allowed = parseCorsAllowedOrigins(" https://app.example.test/ , http://localhost:3000 ");

    assert.equal(allowed.size, 2);
    assert.ok(isCorsOriginAllowed("https://app.example.test", allowed));
    assert.ok(isCorsOriginAllowed("http://localhost:3000", allowed));
    assert.equal(isCorsOriginAllowed("https://other.example.test", allowed), false);
    assert.equal(isCorsOriginAllowed(undefined, allowed), false);
  });

  it("defaults to no cross-origin access when no allowlist is configured", () => {
    const allowed = parseCorsAllowedOrigins(undefined);
    assert.equal(allowed.size, 0);
    assert.equal(isCorsOriginAllowed("https://app.example.test", allowed), false);
  });

  it("rejects wildcards, non-local HTTP, credentials, paths, queries and fragments", () => {
    for (const value of [
      "*",
      "http://app.example.test",
      "https://user:password@app.example.test",
      "https://app.example.test/path",
      "https://app.example.test?key=value",
      "https://app.example.test#fragment",
    ]) {
      assert.throws(() => parseCorsAllowedOrigins(value));
    }
  });
});
