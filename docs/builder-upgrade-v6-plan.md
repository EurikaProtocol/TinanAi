# TINANAI Builder V6 — autonomous software engineer audit and plan

## Phase 1: audit complete

This plan builds on `docs/tinanai-agent-audit.md`, `docs/builder-upgrade-v4-plan.md`, and `docs/builder-upgrade-v5-plan.md`.

- The product remains the existing TINANAI app. The web Builder is in `artifacts/tinanai`, authenticated API routes are in `artifacts/api-server`, account-owned project/version data is in `lib/db`, and API types/client hooks are in `lib/api-client-react`.
- Clerk-derived identity protects saved Builder project routes. Project reads and writes are owner-scoped. Projects currently store source files and bounded versions, not an agent task graph, persistent engineering memory, or agent activity log.
- AI calls use the existing Replit OpenAI integration. There is no production agent orchestrator or independently permissioned agent-worker runtime.
- Builder generation can create bounded static HTML/CSS/JavaScript projects and draft Solidity output. Generated app code is not run in the API process.
- The preview only supports static browser content. Its iframe is not a resource-limited process boundary; CPU, memory, and execution-time quotas are not enforced.
- Current verification reports are limited to existing checks. There is no protected build/test worker, integrated terminal, or framework build pipeline.
- GitHub app-user authorization and Builder deployment are not configured. Existing workspace connectors do not represent consent from TINANAI app users.
- Existing Web3 generation is draft-only. Local compilation is not a security audit, wallet signing, transaction, or deployment.
- The V4 visual direction and first production UI slice are present, but the complete IDE redesign is still in progress.
- The canonical `docs/TINANAI_INTEGRATION_CONTRACT.md` file and a machine-readable EUREKA Builder Contract v1.1 specification/test vectors are absent. Do not invent or claim contract compatibility.

## Boundaries for autonomous work

- Restrict repository inspection and edits to a signed-in user's own Builder project or a repository the user explicitly authorized.
- Do not provide autonomous exploitation, probing, or scanning of arbitrary third-party targets. Security review is limited to defensive analysis of authorized project source.
- No generated or imported source may execute in the privileged API process.
- Do not claim an agent ran, a build passed, or a test passed unless the corresponding tool actually ran and its output was checked.
- Require a reviewed plan and proposed diff before source changes. Production publishing, protected-branch changes, production migrations, secret changes, financial operations, and blockchain transactions require separate explicit approval.
- Enforce model/token budgets, concurrency limits, timeouts, retry limits, and cancellation before enabling multi-agent execution. Do not silently exceed limits or spend on unapproved services.
- Never request or store wallet seed phrases or private keys. Keep signing user-controlled.

## Implementation phases

1. **Audit — complete.** Reuse the current audit; no app code was changed for V6 Phase 1.
2. **Orchestrator and task model.** Define versioned request/result schemas, allowed state transitions, dependencies, ownership scope, cancellation, and audit events. Start with a non-executing, reviewable plan model; do not present this as autonomous execution.
3. **Permission-scoped agents.** Add named roles only when each has an explicit schema, tool allowlist, read/write boundary, error policy, and budget. Keep specialized workers inside the user's authorized project scope.
4. **Secure tool execution.** Blocked until a separate worker enforces filesystem isolation, restricted networking, CPU/memory/time limits, command allowlists, and cancellation. The API server must never run generated code.
5. **Build-test-debug loop.** Blocked on secure execution and the reviewed plan/diff/apply workflow. Add bounded retries and stop conditions; every repair must rerun the relevant checks and inspect real output.
6. **Project memory.** Add owner/project-scoped context and activity storage with retention, redaction, source-refresh rules, and cross-account tests before using it in prompts.
7. **GitHub and deployment preparation.** Use per-user repository consent and isolated branches. Keep force-push, protected branches, production deployment, and production migrations behind explicit approval.
8. **EUREKA CORE.** Wait for the authoritative v1.1 contract and conformance vectors. Then implement authenticated server-to-server integration and validate plans, progress, manifests, hashes, and reports against the source of truth.
9. **End-to-end quality and security.** Test authorization, ownership, prompt-injection boundaries, output schemas, task cancellation, retry limits, failure handling, logs, and the complete user approval path. Run typecheck, relevant tests, and production build after each code phase.

## Existing queued prerequisites

Use, rather than duplicate, the current project tasks for dependency remediation, project privacy, protected execution, AI plan/diff approval, GitHub access, deployment approval, Web3 contract drafts, and EUREKA v1.1 conformance. These tasks remain separate work items until explicitly assigned.

## Immediate next step

## First implementation increment

The initial Master Orchestrator increment is now implemented in the existing Builder:

- Account- and project-scoped run, task, and event records are persisted in PostgreSQL. API reads and writes derive identity from Clerk and filter by both owner and project.
- The Builder exposes a run panel only for saved projects. It sends a user-entered request and a bounded, secret-redacted source snapshot to the existing Replit OpenAI integration.
- The Master Architect makes one structured planning call per run, validates task schemas and dependency graphs, and persists the plan and work items.
- The Static Security Engineer runs defensive local pattern checks. It does not execute project code or contact external systems.
- Runs are sequential, limited to one active run per account and three starts per 15 minutes, have a 90-second provider timeout, and do not retry automatically. Model output is capped; actual token use is recorded. Configurable budget estimates and user-managed budget controls remain future work.
- Active work items have no write-capable executor. They are clearly marked unavailable. No source edits, shell commands, build/test jobs, GitHub operations, deployment, or EUREKA exchange are performed by this increment.
- Cancellation is persisted and aborts a local provider request when possible. If a worker stops, the next read/start marks stale work failed instead of silently retrying it. This is not a distributed worker queue or cross-instance execution service.

The canonical EUREKA Contract v1.1 is still unavailable, so this implementation does not claim compatibility.

Verification completed for this increment:

- `pnpm run typecheck` passed across the repository.
- API server tests passed: 37 tests. TINANAI frontend tests passed: 38 tests.
- API server and TINANAI production builds passed. Vite reported the existing large-chunk advisory.
- Development Drizzle push succeeded; a read-only query confirmed all three new tables.
- The agent-run API path returned 401 when requested without a signed-in session, as required. Both managed services restarted and reported healthy.
- The Builder page rendered in preview. The browser was signed out and had no saved project selected, so the authenticated agent panel was not visually exercised.
- No live model call was made during verification, so provider execution and token accounting were not exercised end-to-end. No production deployment or production schema change was made.

## Next implementation step

Add an explicit plan-review and proposed-diff/apply workflow before enabling any source-writing worker. Keep code execution blocked until an isolated runner can enforce filesystem, network, CPU, memory, time, and cancellation limits. Do not add UI controls for unavailable worker capabilities.
