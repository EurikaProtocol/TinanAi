# TINAN AI / EUREKA CORE — Master Repository Audit

**Audit snapshot:** 2026-11-08  
**Status:** Safe post-audit remediation is implemented on `fix/post-audit-production-readiness`. Production readiness remains **BLOCKED** by the unresolved Zod advisory and unverified owner access.

## Scope and method

This review treated the existing pnpm monorepo as the source of truth. It inspected workspace manifests, artifact boundaries, API entrypoints and routes, database schema modules, current audit/readiness documentation, and the build/test setup. It ran the repository typecheck and build, workspace tests, payment/admin/Mainnet unit and development-database tests, the TINANAI contract tests, and the three available security scanners. It also ran read-only production database metadata/count queries and unauthenticated production API checks.

This is not an authenticated production acceptance test or independent smart-contract audit. No production database content or schema was changed; no DNS change, merge, deployment, wallet signature, chain transaction, or payment was performed.

## Repository architecture

| Area | Location | Current role |
|---|---|---|
| TINANAI web app | `artifacts/tinanai` | React/Vite workspace for AI, Builder, Knowledge, assets, Web3, token and payment pages. |
| Shared API | `artifacts/api-server` | Express API, Clerk middleware, AI/Builder/Knowledge/Payments/Web3 routes, health endpoint. Routed under `/api`. |
| EURIKA dashboard | `artifacts/eurika-dashboard` | Read-only explorer-data dashboard; it does not establish source verification or contract permissions. |
| Canvas preview | `artifacts/mockup-sandbox` | Isolated component preview artifact. |
| API contracts/client | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | OpenAPI generation, runtime schemas and generated React client. |
| Database | `lib/db` | Drizzle/PostgreSQL connection and Builder, Knowledge, payment, cache and agent-run schemas. |
| AI integration | `lib/integrations-openai-ai-server` | Server-side provider integration used by API features. |
| TINAN contracts | `lib/tinanai-contracts` | Hardhat project, fixed-supply TINAN token/Core contracts, tests, ABIs and deployment safeguards. |

## Functional status

- **Authentication:** Clerk middleware is installed at the API boundary; feature routes apply their own authentication and authorization checks. Production health is reachable, while unauthenticated payment-admin and Mainnet-diagnostics requests return 401. An authenticated production owner session was not available, so the identity behind the existing payment-admin row and Clerk session lifetime remain unverified.
- **AI:** Server-side AI calls support the existing assistant, research, Builder and Knowledge flows. The repository is not yet a general-purpose coding agent with a protected build/test worker.
- **Builder:** Produces reviewable static project source and preview/export flows. Generated backend code is not run in the privileged API process. GitHub repository synchronization and isolated framework builds are not implemented.
- **Knowledge:** Account-scoped documents, collections, retrieval and citation checks are implemented. Read-only production counts show 3 documents, 18 chunks spanning all 3 documents, 8 collections, and 1 document/collection link. Production account switching and cross-account authorization were not tested with signed-in users.
- **Web3:** Wallet observation and explicit wallet-approved flows are separated. The TINAN Launchpad deployment boundary remains Sepolia-only; Mainnet preparation is read-only.
- **Tokens:** EURIKA and TINAN are distinct assets. The EURIKA dashboard correctly labels explorer data as unverified where source/ABI evidence is unavailable. Same-symbol historical TINAN contracts require reconciliation before asserting the status of a new TinanAiToken deployment.
- **Payments:** Production has one settings row and six service rows; checkout is disabled, token/treasury values are incomplete, and there are no invoices. No payment was activated.
- **Database:** Read-only production inventory found all 18 current application tables, 176 columns, 38 indexes (25 unique), and pgvector 0.8.0. No migration-ledger table was found. The production database contains data; no production schema or content operation was run.
- **EURIKA data at audit time:** The read-only API returned explorer metadata and recent transactions, but raw logs and Sourcify verification metadata were unavailable. The dashboard labels the data layer as limited and the source as unverified.

## Findings by severity

### HIGH

1. **Unresolved Zod resource-exhaustion advisory — release blocker.** The dependency scan reports `GHSA-mrhx-c7xc-m3w5` for `zod@3.25.76`. The existing investigation documents incompatible Zod 3 consumers in Hardhat and a production dependency path through the wallet/CDP SDK. No forced major upgrade or scanner suppression was applied. See `docs/security/tinanai-remaining-zod-risk.md`.
2. **Production administrator identity and bootstrap configuration need owner verification.** The database has one payment-admin row, but its owner was not identified or exposed. The project Production environment view shows the bootstrap enable flag as `true` and no bootstrap email; current server startup does not call the bootstrap function. The project environment view may differ from Publishing's runtime environment. Do not remove or rely on the flag until the real owner signs in and the published runtime configuration is confirmed; do not grant roles from public registration or wallet connection.

### MEDIUM

3. **Production acceptance remains incomplete.** Real Clerk production sign-in, session-expiration settings, owner authorization, account isolation, and live wallet acceptance were not verified. The managed Clerk dashboard reported that access requires an eligible personal plan; no production credentials or session were requested.
4. **Builder execution boundary limits deployment capability.** Static preview/export is not a protected execution environment. Do not claim generated full-stack apps can be built or deployed.
5. **EURIKA dashboard chunk warning remains.** The full workspace build emits an EURIKA dashboard JavaScript chunk of about 764 kB, above Vite's default 500 kB warning threshold. This TINANAI-focused pass did not change that artifact.
6. **Dependency/duplicate audit is incomplete.** No dependency was deleted. A full usage graph review is still needed before classifying dependencies or duplicated UI primitives as removable.

### RESOLVED IN THIS PASS

- **Credentialed CORS accepted arbitrary origins.** Replaced `origin: true` with the exact `TINANAI_CORS_ALLOWED_ORIGINS` allowlist. Same-origin requests continue to work without a CORS exception; unlisted origins receive no allow-origin response. Invalid configured values fail closed.
- **Typecheck failures.** Added no-emit support for explicit `.ts` imports, removed obsolete suppressions, narrowed the Mainnet preflight input to fields it actually uses, and adapted the diagnostic client through read-only methods.
- **EURIKA build configuration.** Its Vite build now supplies safe default `PORT` and `BASE_PATH` values when the artifact build environment does not pass them.
- **TINANAI route and wallet bundle loading.** Page routes are lazy-loaded. The wallet provider and controls load only on wallet routes or after the user selects Connect Wallet. The emitted initial JavaScript is 678.8 KiB raw / 200.6 KiB gzip, down from the prior 3.05 MB main chunk. The deferred wallet chunk is 1,548.8 KiB raw / 436.6 KiB gzip.
- **TINANAI bundle budgets.** The build now checks the initial bundle, ordinary chunks, and the separately capped wallet chunk. Limits are 850 KiB raw / 280 KiB gzip for initial JavaScript, 800 KiB per ordinary chunk, and 1,800 KiB raw / 550 KiB gzip for the deferred wallet chunk.
- **Bounded request arrays.** Added regression coverage for eight user-controlled API array fields with explicit maximum sizes.
- **Payment-admin route test.** Updated the assertion to match the existing retired Mainnet preflight behavior: authenticated requests receive 409 with an explicit disabled message; the endpoint does not simulate or write audit data.

## Verification

| Check | Result |
|---|---|
| `pnpm run build` | Passed. TINANAI bundle-budget check passed; EURIKA still reports a 764 kB chunk. |
| `pnpm run typecheck` | Passed. |
| `pnpm -r --if-present test` | Passed: 42 API tests, 68 TINANAI tests, and 24 contract tests. |
| API payment tests | Passed: 22 payment tests, 10 payment-admin tests, and 15 Mainnet-preflight tests. Database tests used development fixtures; Mainnet tests used local mocks. |
| Dependency audit | 0 critical, 1 high, 0 moderate, 0 low. The remaining HIGH is Zod 3.25.76; see `docs/security/tinanai-remaining-zod-risk.md`. |
| SAST / HoundDog | 0 findings from each scan; SAST scan was complete. |
| Production API | `GET /api/healthz` returned 200. Unauthenticated payment-admin and Mainnet-diagnostics reads returned 401. |
| Production database | Read-only schema/index inventory succeeded. Aggregate counts confirmed persisted Knowledge data, one admin row, disabled payments, and zero invoices. |
| Production deployment | Public autoscale deployment reports a successful current build. No deployment was performed by this remediation. |
| Preview and account access | The TINANAI public homepage rendered and the deferred Connect Wallet control appeared. Signed-in UI, owner permissions, Clerk session lifetime, and live wallet acceptance were not verified. |

Automated scanner results are not proof that the application has no vulnerabilities.

According to the [Replit data recovery documentation](https://docs.replit.com/features/data-and-storage/data-recovery), production databases use point-in-time recovery by default with at least 7 days of history (up to 28 days on eligible plans); optional daily snapshots are separate. The workspace's exact plan, retention window, and daily-backup setting were not verified. Replit also documents preview deployments against an isolated copy of the production database; none was created because deployment was explicitly out of scope.

## Priority implementation plan

1. Keep the Zod advisory as a release blocker; pursue compatible upstream releases or a separately reviewed toolchain/SDK migration.
2. Have the designated owner verify production sign-in and privileged access, then reconcile the published bootstrap flag without exposing credentials or creating a new admin.
3. Complete authenticated account-isolation and wallet acceptance checks with authorized production accounts; do not use production writes or chain transactions for this audit.
4. If separately approved, use a Replit preview deployment to rehearse future schema changes against an isolated production-database copy before publishing.
5. Review the remaining EURIKA dashboard bundle warning and continue to keep generated backend code outside the privileged API process.

