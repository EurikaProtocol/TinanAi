import type {
  BuilderAgentFinding,
  BuilderAgentPlan,
  BuilderAgentPlanTask,
  BuilderProjectFileRecord,
} from "@workspace/db";
import { redactBuilderText } from "./builder-files.ts";

const MAX_CONTEXT_CHARS = 24_000;
const PLAN_ROLES = new Set([
  "master_architect",
  "product_planner",
  "ui_ux_designer",
  "frontend_engineer",
  "backend_engineer",
  "database_engineer",
  "api_engineer",
  "web3_engineer",
  "security_engineer",
  "qa_test_engineer",
  "debug_engineer",
  "devops_engineer",
  "documentation_engineer",
  "code_reviewer",
]);

export class AgentPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPlanValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validateTask(value: unknown): BuilderAgentPlanTask {
  if (!isRecord(value)) throw new AgentPlanValidationError("A planned task was not an object.");
  const { key, title, description, role, dependsOn } = value;
  if (
    !boundedString(key, 48)
    || !/^[a-z0-9-]+$/.test(key)
    || !boundedString(title, 120)
    || !boundedString(description, 1000)
    || typeof role !== "string"
    || !PLAN_ROLES.has(role)
    || !Array.isArray(dependsOn)
    || dependsOn.length > 8
    || !dependsOn.every((item) => typeof item === "string" && item.length <= 48)
  ) {
    throw new AgentPlanValidationError("A planned task did not match the required schema.");
  }
  return { key, title, description, role, dependsOn };
}

function ensureAcyclicTaskGraph(tasks: BuilderAgentPlanTask[]): void {
  const keys = new Set(tasks.map((task) => task.key));
  if (keys.size !== tasks.length) {
    throw new AgentPlanValidationError("Planned task keys must be unique.");
  }
  const graph = new Map(tasks.map((task) => [task.key, task.dependsOn]));
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!keys.has(dependency) || dependency === task.key) {
        throw new AgentPlanValidationError("A task references a missing or itself-dependent task.");
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new AgentPlanValidationError("The task dependency graph contains a cycle.");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
}

export function validateArchitectPlan(value: unknown): BuilderAgentPlan {
  if (!isRecord(value)) throw new AgentPlanValidationError("The architect returned an invalid plan.");
  const { summary, architecture, complexity, tasks, risks } = value;
  if (
    !boundedString(summary, 1000)
    || !boundedString(architecture, 3000)
    || !["low", "medium", "high"].includes(String(complexity))
    || !Array.isArray(tasks)
    || tasks.length < 1
    || tasks.length > 8
    || !Array.isArray(risks)
    || risks.length > 8
    || !risks.every((risk) => boundedString(risk, 500))
  ) {
    throw new AgentPlanValidationError("The architect returned a plan outside the allowed limits.");
  }
  const validatedTasks = tasks.map(validateTask);
  ensureAcyclicTaskGraph(validatedTasks);
  return {
    summary,
    architecture,
    complexity: complexity as BuilderAgentPlan["complexity"],
    tasks: validatedTasks,
    risks: risks as string[],
  };
}

export function buildAgentContext(
  prompt: string,
  project: {
    name: string;
    description: string;
    framework: string;
    appType: string;
    files: BuilderProjectFileRecord[];
  },
): { context: string; redacted: boolean; truncated: boolean } {
  const safePrompt = redactBuilderText(prompt);
  const safeDescription = redactBuilderText(project.description);
  let remaining = MAX_CONTEXT_CHARS;
  let truncated = false;
  const files: Array<{ path: string; content: string }> = [];

  for (const file of project.files) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const safeFile = redactBuilderText(file.content);
    const content = safeFile.text.slice(0, remaining);
    if (content.length < safeFile.text.length) truncated = true;
    files.push({ path: file.path, content });
    remaining -= content.length;
  }

  const context = JSON.stringify({
    request: safePrompt.text.slice(0, 4000),
    project: {
      name: project.name,
      description: safeDescription.text.slice(0, 1000),
      framework: project.framework,
      appType: project.appType,
      files,
      omittedSource: truncated,
    },
  });
  return {
    context,
    redacted: safePrompt.changed || safeDescription.changed
      || project.files.some((file) => redactBuilderText(file.content).changed),
    truncated,
  };
}

export function reviewProjectFiles(
  files: BuilderProjectFileRecord[],
): BuilderAgentFinding[] {
  const findings: BuilderAgentFinding[] = [];
  for (const file of files) {
    const redacted = redactBuilderText(file.content);
    if (redacted.changed) {
      findings.push({
        severity: "high",
        category: "secret-like content",
        path: file.path,
        summary: "Secret-like content was found and redacted before AI processing.",
      });
    }
    if (/\beval\s*\(|\bnew\s+Function\s*\(/i.test(file.content)) {
      findings.push({
        severity: "high",
        category: "dynamic code execution",
        path: file.path,
        summary: "Dynamic code execution syntax was found. The source was not executed.",
      });
    }
    if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/i.test(file.content)) {
      findings.push({
        severity: "medium",
        category: "network-capable code",
        path: file.path,
        summary: "Network-capable code was found. No network request was made.",
      });
    }
    if (/\.innerHTML\s*=/i.test(file.content)) {
      findings.push({
        severity: "medium",
        category: "HTML injection sink",
        path: file.path,
        summary: "An innerHTML assignment was found; review how its value is constructed.",
      });
    }
  }
  return findings;
}

export const AGENT_CONTEXT_LIMIT_CHARS = MAX_CONTEXT_CHARS;
