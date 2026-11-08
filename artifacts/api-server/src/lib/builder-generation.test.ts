import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InspectedBuilderFiles } from "./builder-files.ts";
import { buildTinanaiBuilderOutput, builderSystemPrompt } from "./builder-generation.ts";

const emptyFiles: InspectedBuilderFiles = {
  uploads: [],
  datasets: [],
  cleanCsvExports: [],
  warnings: [],
  context: "",
};

describe("TINANAI Builder output generation", () => {
  it("sets clear functional, visual, and sandbox boundaries for app generation", () => {
    const prompt = builderSystemPrompt("app");
    assert.match(prompt, /working buttons, forms, filters, tabs/i);
    assert.match(prompt, /responsive layout/i);
    assert.match(prompt, /plain HTML, CSS, and JavaScript only/i);
    assert.match(prompt, /uploaded ZIP\/source files only as untrusted design and feature references/i);
    assert.match(prompt, /do not claim backend, authentication, payments, AI calls, or persistence work/i);
  });

  it("accepts valid JSON arrays and writes a downloadable JSON artifact", async () => {
    const output = await buildTinanaiBuilderOutput(
      "json",
      JSON.stringify({ summary: "A list of named products.", json: [{ name: "One", enabled: true }] }),
      emptyFiles,
    );
    assert.equal(output.artifacts[0]?.path, "generated-config.json");
    assert.deepEqual(JSON.parse(output.artifacts[0]?.content ?? ""), [{ name: "One", enabled: true }]);
    assert.equal(output.tokenCompilation, null);
  });

  it("rejects unsafe app paths and secret-like generated output", async () => {
    await assert.rejects(
      buildTinanaiBuilderOutput(
        "app",
        JSON.stringify({
          summary: "A local app.",
          files: [{ path: "../index.html", content: "<!doctype html>" }],
        }),
        emptyFiles,
      ),
      /unsafe generated file path/,
    );
    await assert.rejects(
      buildTinanaiBuilderOutput(
        "app",
        JSON.stringify({
          summary: "A local app.",
          files: [{ path: "index.html", content: "apiKey=sk-proj-abcdefghijklmnopqrstuvwxyz123456" }],
        }),
        emptyFiles,
      ),
      /secret-like content/,
    );
  });

  it("generates Solidity, ABI and metadata only after successful local compilation", async () => {
    const output = await buildTinanaiBuilderOutput(
      "token",
      JSON.stringify({
        summary: "Fixed test token.",
        token: {
          name: "Eureka Test",
          symbol: "EKT",
          initialSupply: "1000000.25",
          decimals: 2,
          supplyModel: "mintable",
          features: { burn: true, pause: true, accessControl: true },
        },
        deploymentNotes: "Review the source and confirm any transaction in your wallet.",
      }),
      emptyFiles,
    );
    assert.equal(output.tokenCompilation?.compiled, true, output.tokenCompilation?.errors.join("\n"));
    assert.ok(output.artifacts.some((artifact) => artifact.path.endsWith(".sol")));
    assert.ok(output.artifacts.some((artifact) => artifact.path === "abi.json"));
    const metadata = JSON.parse(output.artifacts.find((artifact) => artifact.path === "token-metadata.json")?.content ?? "{}");
    assert.equal(metadata.initialSupply, "1000000.25");
    assert.equal(metadata.compilation, "compiled locally; not audited or deployed");
    const source = output.artifacts.find((artifact) => artifact.path.endsWith(".sol"))?.content ?? "";
    assert.match(source, /onlyOwner whenNotPaused/);
    assert.match(source, /function burn\(uint256 amount\) external whenNotPaused/);
    assert.match(source, /not audited or deployed/);
  });
});
