import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's native TypeScript test runner loads source files with explicit extensions.
import { builderGenerationErrorMessage } from "./builder-request-errors.ts";

describe("Builder generation errors", () => {
  it("shows a safe server explanation for upload-limit errors", () => {
    assert.equal(
      builderGenerationErrorMessage({
        status: 413,
        data: { error: "Each uploaded file must fit the configured 20 MB limit." },
      }, "app"),
      "Each uploaded file must fit the configured 20 MB limit.",
    );
  });

  it("explains a 413 response when the server provides no message", () => {
    assert.match(
      builderGenerationErrorMessage({ status: 413 }, "analytics"),
      /20 MB or smaller.*50 MB or smaller/,
    );
  });

  it("redacts credentials in API error text", () => {
    assert.equal(
      builderGenerationErrorMessage({
        status: 400,
        data: { error: 'api_key: "sensitive-value-12345"' },
      }, "json"),
      'api_key: "[REDACTED]"',
    );
  });

  it("keeps a generic message for unexpected server failures", () => {
    assert.match(
      builderGenerationErrorMessage({ status: 502, data: { error: "internal trace details" } }, "app"),
      /Generation failed\. No app was generated/,
    );
  });
});
