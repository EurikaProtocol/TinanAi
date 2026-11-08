# TINANAI Builder Upgrade V3

## Audit baseline

- The current Builder already has AI source generation, deterministic local templates, account-owned project CRUD, local-browser projects for signed-out use, duplicate/delete, ZIP export, version snapshots, static checks, and a basic iframe smoke test.
- The editor is a real controlled source editor, but currently lacks file rename/search and find-and-replace. It has no syntax highlighting or tabbed editor surface.
- Preview is intentionally limited to static HTML/CSS/JavaScript. It uses a sandboxed iframe without `allow-same-origin` and restrictive CSP, but it is not a process boundary and has no CPU or memory quotas.
- No generated project is executed in the privileged API server. There is no full framework/package/backend build or test runtime and no automatic repair/retry loop.
- Per-user GitHub repository authorization was not found in the Builder paths reviewed. A separate project task already covers safe user-owned GitHub connections.
- No implementation of EUREKA CORE Builder Contract v1.1 or canonical machine-readable contract was found in the Builder sources reviewed. Compatibility must not be claimed until its exact versioned contract is available and verified.

## Incremental plan

1. **Editor usability (in progress):** add safe file rename for non-entry files, source-file filtering, literal find/replace, and a saved/unsaved indicator. Preserve project ownership, save/version behavior, static preview limits, and no-dependency scope.
2. **Rich editor surface:** after the active dependency remediation is settled, evaluate an established editor library and implement syntax highlighting, tabs, and keyboard navigation without changing the project-file API contract.
3. **Build, test, and repair:** keep preview-only behavior until generated apps run in a separately isolated environment with enforceable resource limits. The existing protected-environment task covers this larger boundary; no server-process execution is allowed.
4. **Project workflows and GitHub:** build on current CRUD/history/export behavior; GitHub authorization and production deploy approval remain explicit, separate steps. Existing GitHub and deployment-approval tasks already cover those scopes.
5. **EUREKA contract compatibility:** obtain the canonical v1.1 schema, role/permission semantics, and verification vectors; then implement conformance tests before exposing contract-driven UI.

## Guardrails

- Do not publish, alter production data, run arbitrary project code in the API process, or bypass human approval.
- Keep imported files untrusted and request-scoped; do not persist uploaded credentials or use them to authorize external services.
- Describe preview checks precisely: static checks and a short browser load smoke check are not a production build or exhaustive test suite.
