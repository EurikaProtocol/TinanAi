# Security Audit Report

**Date:** 2026-11-08  
**Overall:** **BLOCKED for production** while the HIGH dependency advisory and production-owner verification remain unresolved.

## Automated checks

- Dependency audit: **1 HIGH**, `GHSA-mrhx-c7xc-m3w5` / `zod@3.25.76`; no critical findings.
- SAST: no findings returned.
- HoundDog: no findings returned.

The Zod issue has a dedicated investigation at `docs/security/tinanai-remaining-zod-risk.md`. The scanner's suggested Zod 4 update is a major compatibility change for current consumers; it was not forced.

## Changes in this audit

Credentialed CORS previously reflected arbitrary origins. The API now accepts cross-origin requests only for exact origins listed in `TINANAI_CORS_ALLOWED_ORIGINS`. The parser rejects wildcard entries, credentials, paths, query strings, fragments, non-HTTPS public origins, and malformed values. Empty configuration disables cross-origin access; the same-origin TINANAI UI/API flow does not need a CORS exception.

## Existing controls and remaining checks

- Clerk middleware is installed centrally; protected features use route-level user/admin checks. Production login and owner access were not tested.
- Express JSON payloads have a default size limit and Builder project routes use a larger explicit limit. Rate-limit and Builder validation tests exist.
- Builder inputs are inspected/redacted and generated backend code is not executed in the API process. Static iframe preview is not equivalent to a resource-limited worker.
- Payment administration is gated and payment initialization is explicit. Checkout remains disabled; live transfer/receipt acceptance was not performed.
- Wallet flows do not store server-side private keys and do not automatically sign or broadcast transactions.
- Production database ownership, backups, DDL and data retention were not inspected. Never use the force-push schema command against production without a reviewed migration plan.
- A production administrator bootstrap setting exists in workspace deployment configuration. Verify the real production owner can sign in before removing it; do not make a public or first-user grant.
- `.env.example` contains blank placeholders only. Use Replit Secrets for real credentials and rotate any credential ever committed to Git history.

## Release actions

1. Resolve or explicitly mitigate the Zod advisory with compatible, tested dependency paths.
2. Verify the production owner without bootstrap, then remove temporary bootstrap configuration.
3. Test authorization and account isolation against production-like identities/data.
4. Confirm database backups and reviewed migration/rollback steps before schema changes.

