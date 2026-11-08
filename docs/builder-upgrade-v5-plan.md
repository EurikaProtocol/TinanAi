# TINANAI Builder V5 — autonomous studio audit and plan

> Historical V5 phase plan. The current authoritative roadmap is `docs/builder-upgrade-v6-plan.md`.

## Audit baseline

The existing audits in `docs/tinanai-agent-audit.md` and `docs/builder-upgrade-v4-plan.md` remain accurate:

- TINANAI is an existing multi-artifact application. The web Builder is in `artifacts/tinanai`, its authenticated API is in `artifacts/api-server`, project/version records are defined under `lib/db`, and the generated client is under `lib/api-client-react`.
- Builder project API routes use the authenticated Clerk identity and owner-scoped queries. Saved projects contain source files and bounded version snapshots; they do not yet have persistent AI memory, agent-run records, or a task graph.
- AI generation uses the existing Replit OpenAI integration. Builder generation produces bounded static projects or Web3 token drafts; generated app code is not executed in the API process.
- The preview is static HTML/CSS/JavaScript in a sandboxed iframe. It is not a process sandbox and has no CPU, memory, or network-resource quotas. There is no protected build/test worker, real terminal, or framework build runner.
- The editor preserves the V3 safe rename, filtering, literal find/replace, and saved/unsaved behavior. It remains a controlled text editor without a syntax-aware editor library, multi-tab state, formatting, undo/redo, or compiler diagnostics.
- The current navy/cyan design tokens and V4 Canvas concept exist. The production Builder has only received an initial visual slice; the whole workspace has not yet been redesigned.
- There is no app-user GitHub authorization or Builder deployment workflow. Workspace integrations do not substitute for an app user's consent.
- Existing Web3 output is draft-only; local compilation, when available, is not a security audit, transaction, or deployment.
- `docs/TINANAI_INTEGRATION_CONTRACT.md` is absent, and no canonical EUREKA Builder Contract v1.1 schema was found. Do not claim compatibility or invent contract semantics.

## Safety and scope decisions

- Keep work in the existing TINANAI application; do not create a second studio or modify EurekaCore.
- Limit coding tasks to projects the signed-in user owns or source they explicitly selected. Do not turn the Builder into an autonomous scanner or exploit runner for arbitrary third-party targets.
- Do not run generated or imported code in the privileged API process. Keep build/test disabled until a separate worker enforces filesystem, network, CPU, memory, time, and cancellation limits.
- Require explicit user review before applying proposed multi-file edits, changing protected Git branches, modifying secrets or production data, publishing, or submitting blockchain transactions.
- Never request or store wallet seed phrases or private keys; keep Web3 outputs reviewable drafts until a separately approved, user-controlled signing flow exists.
- Do not display placeholder controls as working integrations. Show capability limits and connection status truthfully.

## Phased implementation plan

1. **Audit and architecture — complete.** Reuse the existing agent audit and V4 plan; preserve the current branch and working Builder features.
2. **Design system and workspace — in progress.** Finish applying the existing navy/cyan tokens and responsive V4 direction to the real Builder. Keep this phase limited to real current behavior; do not add fake Agents, GitHub, terminal, or Deployment pages.
3. **IDE and file workflow.** Continue from the existing V3 file operations. Add a syntax-aware editor, tabs, undo/redo, and diagnostics only after dependency remediation is complete; path-safe import/move/delete must retain confirmations and ownership checks.
4. **Project context and reviewable agent workflow.** Add account/project-scoped context and an explicit plan/proposed-diff/apply flow. Keep read-only questions separate from write-capable modes; record user approvals and agent activity without mixing accounts or projects.
5. **Protected build and test worker.** Do not expose command execution until the isolated runner can enforce filesystem/network/resource/time limits and safe cancellation. Only allow supported, documented project runtimes.
6. **Testing and debugging.** Report only commands actually executed; use real logs and re-run checks after approved repairs. Do not claim successful builds from static preview checks.
7. **Web3 workspace.** Build on the existing draft-only Solidity generator/compiler after its dedicated task. Keep transaction signing user-controlled; add no private-key handling or automatic deployment.
8. **GitHub and deployment.** Use per-user authorization and explicit branch/publish approval. Do not reuse workspace connector credentials for app users.
9. **Security and EUREKA compatibility.** Add permission-boundary, ownership, audit, and failure tests. Implement EUREKA compatibility only after receiving the canonical v1.1 contract and test vectors.

## Existing queued work

Several prerequisites already have project tasks: dependency remediation, protected execution, AI plan/diff review, user-authorized GitHub, deployment approval, Web3 contract drafts, cross-account project privacy, syntax-aware editing, and EUREKA v1.1 conformance. Avoid duplicating those task scopes; use them as dependencies when the user assigns the relevant phase.

## Verification rule

For every code phase, run the relevant TINANAI tests, typecheck, and production build; fix regressions before moving to the next phase. Keep production data, secrets, schema, and deployment settings untouched unless separately approved.
