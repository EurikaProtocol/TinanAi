import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRateLimitKey, createFixedWindowRateLimiter } from "./fixed-window-rate-limit.ts";

describe("fixed-window request limiter", () => {
  it("allows the configured request count and rejects further requests", () => {
    const limiter = createFixedWindowRateLimiter({ windowMs: 100, maxRequests: 2 });

    assert.equal(limiter.take("user:one", 10), true);
    assert.equal(limiter.take("user:one", 11), true);
    assert.equal(limiter.take("user:one", 12), false);
  });

  it("starts a new window after the configured duration", () => {
    const limiter = createFixedWindowRateLimiter({ windowMs: 100, maxRequests: 1 });

    assert.equal(limiter.take("user:one", 10), true);
    assert.equal(limiter.take("user:one", 109), false);
    assert.equal(limiter.take("user:one", 110), true);
  });

  it("bounds stored identities without evicting active limits", () => {
    const limiter = createFixedWindowRateLimiter({
      windowMs: 100,
      maxRequests: 1,
      maxEntries: 2,
    });

    assert.equal(limiter.take("user:one", 10), true);
    assert.equal(limiter.take("user:two", 10), true);
    assert.equal(limiter.take("user:three", 10), false);
    assert.equal(limiter.take("user:one", 11), false);
    assert.equal(limiter.take("user:three", 110), true);
  });

  it("uses account identity when available and IP fallback otherwise", () => {
    assert.equal(buildRateLimitKey(" user-1 ", "192.0.2.1"), "user:user-1");
    assert.equal(buildRateLimitKey(null, "192.0.2.1"), "ip:192.0.2.1");
    assert.equal(buildRateLimitKey(undefined, undefined), "ip:shared-preview");
  });

  it("rejects invalid limiter settings", () => {
    assert.throws(() => createFixedWindowRateLimiter({ windowMs: 0, maxRequests: 1 }), RangeError);
    assert.throws(() => createFixedWindowRateLimiter({ windowMs: 1, maxRequests: 0 }), RangeError);
    assert.throws(
      () => createFixedWindowRateLimiter({ windowMs: 1, maxRequests: 1, maxEntries: 0 }),
      RangeError,
    );
  });
});
