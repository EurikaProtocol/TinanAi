import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BuilderProjectFileRecord } from "@workspace/db";
import { AGENT_CONTEXT_LIMIT_CHARS, AgentPlanValidationError, buildAgentContext, reviewProjectFiles, validateArchitectPlan } from "./builder-agent-agents.ts";

const files: BuilderProjectFileRecord[] = [
  {
    path: "index.html",
    content: '<script>fetch("https://example.test"); el.innerHTML = input;</script>',
    mediaType: "text/html",
  },
];

const validPlan = {
  summary: "Improve the saved app.",
  architecture: "Keep the current static HTML structure.",
  complexity: "low",
  tasks: [
    {
      key: "inspect-source",
      title: "Inspect the source",
      description: "Review existing project files and identify relevant components.",
      role: "master_architect",
      dependsOn: [],
    },
    {
      key: "review-security",
      title: "Review source safety",
      description: "Run defensive static checks on the selected source.",
      role: "security_engineer",
      dependsOn: ["inspect-source"],
    },
  ],
  risks: ["No isolated build runner is configured."],
};

describe("Builder agent roles", () => {
  it("validates task schemas and dependency ordering", () => {
    assert.equal(validateArchitectPlan(validPlan).tasks.length, 2);
    assert.throws(
      () => validateArchitectPlan({
        ...validPlan,
        tasks: validPlan.tasks.map((task) => ({
          ...task,
          dependsOn: task.key === "inspect-source" ? ["review-security"] : ["inspect-source"],
        })),
      }),
      AgentPlanValidationError,
    );
    assert.throws(
      () => validateArchitectPlan({
        ...validPlan,
        tasks: [{ ...validPlan.tasks[0], key: "bad key" }],
      }),
      AgentPlanValidationError,
    );
  });

  it("redacts secret-like source before constructing bounded model context", () => {
    const result = buildAgentContext("Review this project", {
      name: "Sample",
      description: "A small app",
      framework: "static_html",
      appType: "web_app",
      files: [{
        path: "index.html",
        content: 'const api_key="sk-proj-abcdefghijklmnopqrstuvwxyz123456";',
        mediaType: "text/html",
      }],
    });
    assert.equal(result.redacted, true);
    assert.equal(result.truncated, false);
    assert.equal(result.context.includes("sk-proj-abcdefghijklmnopqrstuvwxyz123456"), false);
    assert.match(result.context, /\[REDACTED\]/);
  });

  it("caps source context while preserving project metadata", () => {
    const result = buildAgentContext("Build a clear settings page", {
      name: "Large",
      description: "bounded test",
      framework: "static_html",
      appType: "web_app",
      files: [{
        path: "index.html",
        content: "x".repeat(AGENT_CONTEXT_LIMIT_CHARS * 2),
        mediaType: "text/html",
      }],
    });
    assert.equal(result.truncated, true);
    assert.ok(result.context.length < AGENT_CONTEXT_LIMIT_CHARS + 1000);
    assert.match(result.context, /"omittedSource":true/);
  });

  it("reports defensive static findings without returning matched code", () => {
    const findings = reviewProjectFiles([
      ...files,
      {
        path: "config.js",
        content: 'const password="some-very-long-secret-value";',
        mediaType: "text/javascript",
      },
    ]);
    assert.deepEqual(
      new Set(findings.map((finding) => finding.category)),
      new Set(["network-capable code", "HTML injection sink", "secret-like content"]),
    );
    assert.equal(findings.some((finding) => finding.summary.includes("some-very-long-secret-value")), false);
  });
});
