# TINANAI AI Development Agent Audit

**Audit date:** 2026-10-28  
**Scope:** Existing TINANAI web app, API agent routes, prompt assembly, Builder and Knowledge safety boundaries, account ownership patterns, capability status, and current tests. EurekaCore and unrelated applications were not changed.

## Summary

TINANAI already has working AI chat, document analysis, app generation, live web research, and a source-grounded Knowledge Library. It is not yet a project-aware coding agent: it cannot inspect an app user's repository, edit project files, run builds or tests in an isolated worker, use a per-user GitHub connection, or trigger an app deployment.

The most important safety rule is to keep generated code out of the privileged API process. Current Builder projects are limited to static source and a restricted browser preview; that preview is not a process sandbox and does not impose CPU or memory quotas.

## Existing capabilities

| Area | Current state |
|---|---|
| AI provider | Server-side OpenAI-compatible access through the configured Replit AI integration. Chat, document, Builder, and Knowledge flows use existing model calls; live research uses Responses web search. |
| Prompt and mode handling | Separate assistant instructions for chat, documents, Builder, and tokenization. Green Leaf adds a conversation-scoped chat profile without changing other modes or permissions. |
| Research | Provider-returned source annotations are filtered and displayed. The app does not independently verify that citation URLs are reachable or correct. |
| Builder | Generates bounded static-project output and validates paths and secret-like content. It does not execute generated source in the API process. Browser preview/testing remains limited. |
| Project data | Saved Builder projects and versions are account-owned; Knowledge Library data is account-scoped. Assistant history and other workspace records remain browser-local. |
| Knowledge context | Local embedding-based retrieval; answers use retrieved excerpts and validate citation IDs against retrieved sources. |
| Authentication and authorization | Clerk protects server-owned Knowledge and Builder resources. The broader workspace is not a cloud-synced, account-owned coding workspace. |
| Tests | Existing deterministic tests cover Builder file handling, generated output validation, Green Leaf, Knowledge extraction/grounding, and research citation parsing. |

## Main gaps and risks

1. **No coding-agent workflow:** there is no task planner, project-context retriever, task state, diff-producing editor, or agent action history.
2. **No protected execution worker:** there is no isolated build/test service. The API server must not run uploaded or generated code. The iframe preview is not a resource-limited process boundary.
3. **No app-user GitHub integration:** the workspace's own connector is not an end-user authorization mechanism. Repository access needs per-user consent and isolated branch/working-copy handling.
4. **No app-level deployment workflow:** Cloudflare workspace access is not equivalent to user-authorized app deployment. Production changes require explicit approval and a real application integration.
5. **Limited usage controls:** request limits are in-memory and instance-local; they do not provide a persistent per-user budget or dollar estimate. Provider calls can consume Replit credits.
6. **Limited provider abstraction:** assistant models are selected in route code; there is no replaceable provider layer, model availability check, or no-cost fallback guarantee.
7. **No measured self-improvement loop:** there is no task-outcome store, quality baseline, or automated comparison proving that a prompt/tool/code change improves results.
8. **Context and memory separation:** conversation history is browser-local; any future server-side agent memory must be isolated per account and project, refreshed as source changes, and must exclude secrets.

## Implemented in this pass

- Added a shared fixed-window limiter for assistant and research requests. It keys authenticated requests by Clerk user ID and anonymous requests by IP, purges expired windows, and caps stored identities at 5,000. When full, it rejects new identities instead of evicting active limits.
- Preserved the existing route-specific request and concurrency limits. The new helper does not combine the assistant and research budgets, persist budgets across server restarts, or estimate dollars.
- Replaced the unsupported “Most powerful AI builder” homepage claim with neutral copy, “AI builder by EurekaCore.”
- Added deterministic tests for limits, expiration, bounded identity storage, account/IP keys, and invalid configuration.

No model requests, new paid services, dependencies, database migrations, or production actions were used for this pass.

## Recommended next phases

1. Add deterministic regression tests for agent inputs, prompt-injection boundaries, output schemas, and failure handling; record a baseline before changing prompts or models.
2. Build project-aware context from a user-selected, account-owned Builder project. Return a plan and proposed diff first; do not apply edits or run code without a separately approved workflow.
3. Design an isolated build/test worker with strict filesystem, network, CPU, memory, time, and cancellation limits. If that infrastructure is unavailable at €0, keep execution disabled and report the blocker.
4. Add user-authorized GitHub access with branch isolation and explicit approval gates; do not reuse workspace credentials for app users.
5. Add account/project-scoped memory with source refresh, retention limits, secret redaction, and cross-account isolation tests.
6. Add deployment preparation only after a user-owned integration and production approval path are configured.
7. Add a provider adapter and model configuration only when supported by the existing integration and verified model availability.

## Verification for this pass

- `pnpm run typecheck` — passed.
- `pnpm --filter @workspace/api-server test` — passed, 31 tests.
- `pnpm --filter @workspace/tinanai test` — passed, 10 tests.

## Rollback and scope

Replit workspace checkpoints provide rollback protection. At the start of this work, Git was on `main` with a pre-existing modified `.replit`; that file was left untouched, and no Git commit or push was made. No destructive database, deployment, or cross-project changes were made.
