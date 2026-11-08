# Agent Change Log

## 2026-11-08 — Initial repository audit and safe repairs

- Replaced permissive credentialed CORS with exact-origin configuration using `TINANAI_CORS_ALLOWED_ORIGINS`; added validation and tests.
- Fixed API-server TypeScript errors around explicit Node TypeScript imports, Mainnet preflight configuration typing and the read-only diagnostic client adapter. Removed obsolete `@ts-expect-error` comments rather than suppressing diagnostics.
- Added EURIKA dashboard build defaults for the artifact's port and base path.
- Added `.env.example` with blank placeholders and audit, architecture, security, AI, Web3, production readiness and deployment documentation.
- Preserved existing contracts, payment settings and production database; no wallet signing, chain transaction, payment or publish occurred.

## Verification

- `pnpm run typecheck` — passed.
- `pnpm run build` — passed; large TINANAI chunk warning remains.
- `pnpm -r --if-present test` — passed (41 API tests, 68 TINANAI tests).
- `pnpm --filter @workspace/tinanai-contracts test` — passed (24 local tests).
- Security scanners: one unresolved HIGH dependency advisory; SAST and HoundDog returned no findings.

