# TINANAI Builder V4 — audit and phased plan

## Audit

- The Builder is an existing TINANAI route backed by the shared API client. It already supports request-scoped AI generation, static local templates, account-owned project CRUD, browser-local projects when signed out, duplicate/delete, version history, ZIP export, static checks, an iframe smoke test, and full-page preview.
- The previous V3 increment is present: safe non-entry-file rename, source-file filtering, literal find/replace, saved/unsaved status, and regression tests. Preserve these behaviors.
- The API server authenticates Builder project routes and filters reads/writes by the Clerk-derived owner ID. Project records store source files and bounded version snapshots; they do not include persistent AI project memory.
- Generation uses the existing Replit OpenAI integration. Uploads are request-scoped, redacted, and not executed. Existing preview supports static HTML/CSS/JavaScript only, runs in a sandboxed iframe without `allow-same-origin`, blocks network access, and has no CPU/memory quotas.
- The TINANAI global dark tokens already provide the requested midnight navy surfaces and cyan primary accent. The current Builder and preview screen contain several hard-coded colors that should be brought onto those shared tokens.
- The Canvas currently contains an extracted Builder baseline and V3 redesign concepts, including a review-docket direction. These are references, not working Builder features.
- `docs/TINANAI_INTEGRATION_CONTRACT.md` is not present, and the reviewed source contains no canonical EUREKA Builder Contract v1.1 schema or implementation. Do not redefine the contract or claim compatibility without the authoritative spec.
- No syntax-highlighting editor dependency, project import workflow, real terminal, AI mode permissions, GitHub repository authorization, or Builder deployment center was found.

## Phased implementation

1. **Audit and architecture — complete.** Preserve existing account ownership, browser-local privacy, upload handling, versioning, and preview limitations.
2. **Canvas-aligned workspace UI — first implementation slice.** Use existing TINANAI navy/cyan tokens; improve the Builder workspace and full-page preview responsively; keep every existing action wired to its real behavior. Do not add controls that imply unavailable services.
3. **Editor capabilities.** Preserve V3 file operations; add the real editor library, tabs, diagnostics, and formatting only after the active dependency remediation is settled and compatibility is confirmed. Keep deletion/move/import operations path-safe and confirm destructive actions.
4. **AI modes and project context.** Introduce explicit mode permissions and a server-validated proposal/review/apply contract. Keep ASK read-only, and require human review before significant file changes. Persistent project memory requires an owner-scoped storage/API design and tests.
5. **Preview, runtime, and terminal.** Continue honest static-only preview until generated projects can run in a separately isolated environment with enforceable resource limits. Do not execute arbitrary code in the API process. The protected-runner project task covers this boundary.
6. **GitHub and project workflows.** Build on current project CRUD/history/export. Per-user repository authorization and protected-branch rules remain in the existing GitHub task. Do not expose tokens in the browser.
7. **Testing, security, and deployment.** Keep status reports tied to commands that actually ran. A production deployment remains a separately approved action; no deployment or production data changes are part of this work.
8. **EUREKA CORE compatibility.** Obtain the canonical versioned v1.1 contract, including plan/manifest digest rules, permissions, and verification examples. Then implement contract-specific validation and conformance tests without independently redefining it.

## Current implementation scope

**Initial UI slice delivered; Phase 2 is not complete.** The Builder now has a responsive project/status header, editor and runtime-console surfaces use the shared midnight tokens, and file deletion asks for confirmation. The live Canvas V4 concept was derived from the extracted Builder source and checked at desktop and mobile viewport sizes. Existing generation, account/local project separation, file filtering, safe rename, literal find/replace, save/version/export, checks, and static preview behavior remain in place.

TINANAI verification after the code changes: typecheck passed; all 38 tests passed; production build passed with the existing large-chunk advisory. The Builder route's signed-in interface was not visually verified because the preview browser has no authenticated session.

Next: complete the responsive workspace layout using only real existing capabilities, then stage editor-library and AI/runtime/integration work behind the prerequisites below. Syntax highlighting and new backend capabilities are intentionally staged behind their dependency, isolation, integration, and contract prerequisites.

## Guardrails

- Work remains on the separate `feature/builder-ultimate-v3` branch.
- Do not publish, alter production data, change secrets, or run production DDL.
- Do not silently add paid services or dependencies.
- Treat imported repositories and uploaded files as untrusted; keep them request-scoped unless a separate authorized persistence flow exists.
- Never claim full framework execution, exhaustive testing, GitHub integration, deployment, or EUREKA compatibility until each is implemented and verified.
