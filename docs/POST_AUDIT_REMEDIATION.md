# Post-audit production-readiness remediation

**Branch:** `fix/post-audit-production-readiness`  
**Outcome:** Safe code and test changes are complete. Production readiness remains **BLOCKED**.  
**Pull request:** The original local remediation did not create a PR. See `docs/GITHUB_SYNCHRONIZATION.md` for the later GitHub synchronization and review branch.

## Guardrails observed

This work did not merge, deploy, alter DNS, modify production database contents or schema, enable payments, request production credentials, or execute wallet signatures or blockchain transactions. Production checks were limited to public unauthenticated GET requests and read-only SQL metadata/aggregate queries.

## Changes made

### Frontend bundle loading and budgets

- Lazy-loaded TINANAI route components instead of loading all page modules in the initial bundle.
- Deferred the wallet provider and wallet controls until a wallet route is opened or the user selects Connect Wallet. Payment, contract, and Launchpad routes still load the provider.
- Added build-enforced JavaScript budgets:
  - Initial static JavaScript: maximum 850 KiB raw / 280 KiB gzip.
  - Ordinary individual chunks: maximum 800 KiB raw.
  - Deferred wallet chunk: maximum 1,800 KiB raw / 550 KiB gzip.
- The current production build measured the initial JavaScript at 678.8 KiB raw / 200.6 KiB gzip. The optional wallet chunk measured 1,548.8 KiB raw / 436.6 KiB gzip. The previous TINANAI entry chunk was about 3.05 MB raw.

### API input bounds

Added regression tests for eight bounded user-controlled arrays in generated Zod request schemas. Oversized assistant histories, upload/project file collections, payment services, collection IDs, and Knowledge histories are rejected with a maximum-size issue.

### Payment-admin regression test

The local admin-router test had expected HTTP 200 from the retired Mainnet preflight endpoint. The route intentionally returns HTTP 409 with a disabled message. The test now checks that behavior and still verifies unauthorized subjects and wallet headers cannot gain admin access. No endpoint behavior was changed.

### Zod advisory

The HIGH `GHSA-mrhx-c7xc-m3w5` / `CVE-2023-54404` finding remains open for `zod@3.25.76`. The current production dependency graph includes AppKit → Pay/Utils → Base Account → CDP SDK → Zod 3, and the contract toolchain also requires Zod 3. No incompatible override, scanner suppression, or package removal was applied. Details and migration constraints are in `docs/security/tinanai-remaining-zod-risk.md`.

## Production observations

The current published app is publicly reachable at `https://app.tinaneureka.com`; deployment metadata reports an autoscale deployment with a successful current build. These checks describe the currently published build, not this unmerged branch.

| Read-only check | Observation |
|---|---|
| `GET /api/healthz` | HTTP 200 |
| Unauthenticated payment-admin read | HTTP 401 |
| Unauthenticated Mainnet-diagnostics read | HTTP 401 |
| Public schema inventory | 18 tables, 176 columns, 38 indexes (25 unique); pgvector 0.8.0 |
| Migration ledger | No migration-ledger table found |
| Knowledge data | 3 documents, 18 chunks covering 3 documents, 8 collections, 1 document/collection link |
| Builder data | 0 saved Builder projects |
| Payment administration | 1 admin row; the owner identity was not read or exposed |
| Payment configuration | 1 settings row and 6 service rows; checkout disabled; token/treasury configuration incomplete; 0 invoices |

The production table inventory matched the application table set. No rows containing document text, owner IDs, wallet addresses, secrets, or credentials were returned. These aggregate checks confirm persisted Knowledge data and the presence of application indexes; they do not prove account isolation for authenticated users.

The project Production environment view showed `TINANAI_PAYMENT_ADMIN_BOOTSTRAP_ENABLED` as enabled, with no bootstrap email present in that view. The current server entrypoint does not call the bootstrap function at startup, and tests confirm startup does not initialize payments or grant roles. The project environment view may differ from the published runtime environment, so the live flag state is not conclusively verified. One payment-admin row exists, but its identity was not matched to the designated owner.

The managed Clerk dashboard reported that dashboard access requires an eligible personal plan. No authorized production sign-in session was provided. Therefore production owner sign-in, role assignment to the intended owner, and session-expiration settings remain unverified. The signed-in UI was not bypassed.

## Verification

| Check | Result |
|---|---|
| `pnpm run build` | Passed; TINANAI bundle budgets passed |
| `pnpm run typecheck` | Passed |
| `pnpm -r --if-present test` | Passed: 42 API, 68 TINANAI, and 24 contract tests |
| `pnpm --filter @workspace/api-server run test:payments` | Passed: 22 tests; development database fixtures cleaned up |
| `pnpm --filter @workspace/api-server run test:payment-admin` | Passed: 10 tests; development database fixtures cleaned up |
| `pnpm --filter @workspace/api-server run test:mainnet` | Passed: 15 local/mock tests; no chain transactions |
| Dependency audit | 0 critical, 1 high (Zod 3.25.76), 0 moderate, 0 low |
| SAST | Complete; 0 findings |
| HoundDog | 0 findings |
| Preview | Public TINANAI homepage rendered with the deferred Connect Wallet control. The signed-in UI was not verified. |

The full workspace build also still reports a roughly 764 KiB EURIKA dashboard JavaScript chunk above Vite's default 500 KiB warning threshold; this TINANAI-focused remediation did not change EURIKA.

## Backup and deployment rehearsal

Replit's [data recovery documentation](https://docs.replit.com/features/data-and-storage/data-recovery) says production databases have point-in-time recovery enabled by default, with at least 7 days of history (up to 28 days for eligible plans); optional daily snapshots are separate. This project's plan-specific retention and daily-backup setting were not verified.

Replit documents a preview deployment that can test against an isolated copy of the production database after schema validation. This confirms a future rehearsal path, but no preview deployment was created because deployment was explicitly prohibited for this work.

## Remaining release blockers

1. Resolve the production Zod 3 dependency path without breaking Hardhat, AppKit, or Base/CDP behavior.
2. Have the designated owner verify production sign-in and privileged permissions; then reconcile the published bootstrap configuration without exposing credentials or creating a hidden admin.
3. Complete authenticated production account-isolation and wallet acceptance checks with authorized accounts. No credentials or private keys should be shared in chat.
4. Use an isolated preview deployment for future schema rehearsals only after separate explicit approval.

## GitHub status

At the time of the original remediation, the API connector reported `connect` after attachment and no repository had been identified, so no PR was created for that local branch. Later verification established that native Git and the GitHub CLI authenticate as EurikaProtocol and have write access to `EurikaProtocol/TinanAi`. The current synchronization uses those authenticated tools on `feature/sync-current-tinanai`; it does not merge or deploy. See `docs/GITHUB_SYNCHRONIZATION.md` for its scope and backup.
