# TINANAI payment and Mainnet readiness audit

Follow-up: see `tinanai-production-wallet-readiness.md` for WalletConnect repairs,
the newer quote, and stricter production-readiness rules. Earlier `ready` results
in this historical report described token-deployment preparation, not fully
configured production payments.

Date: 2026-11-06. Scope: existing TINANAI application and fixed-supply TinanAiToken.
No public-chain transaction, wallet signature, deployment, payment activation,
treasury/rate invention, or EUREKA configuration change was permitted or performed.

## Overall status: BLOCKED for deployment

The repaired code and automated checks pass, but this is not deployment
authorization. A live matching WalletConnect session, independent deployment-history
review, provider-credential rotation confirmation, publication and actual production-owner
verification remain necessary.

## Root causes and corrections

| Item | Status | Finding and correction |
|---|---|---|
| Administrator identity | PASS in development | The actual existing owner's Clerk account/session/token subject was verified before privileged browser calls. Server database membership—not wallet connection or client metadata—controls access. |
| First-admin recovery | PASS | Existing private audited one-time owner bootstrap remains intact; no public self-promotion endpoint. Production has an active audited owner bootstrap membership, but that is not an authenticated production-owner browser test. |
| Production owner access | NOT TESTED | Safe authentication of the distinct production identity was not available to the tester. No development ID or credentials were copied into production. |
| Confirmation policy | PASS in development | Prior default and Sepolia exception allowed 2. Frontend, OpenAPI/backend and effective transfer verification now require 12–100 integer confirmations on both networks. |
| Existing low confirmation counts | PASS in development | Initialization raises low settings to 12 with a revision increment and audit record. It does not activate checkout. Legacy invoice verification cannot grant credit before 12 confirmations. |
| Catalog configuration | PASS | A nonempty arbitrary string was incorrectly considered configured. Validation now requires a credential-free HTTPS catalog URL with the expected API path. The setting was corrected to the verified published app's catalog URL. |
| Read-only estimates | PASS | A missing wallet previously prevented gas estimation. The approved public account can now be quoted without a wallet, while mandatory wallet checks still block readiness. |
| Checklist completeness | PASS | Every check remains visible, including blocked and unperformed checks. Readiness requires all mandatory checks to pass. |
| Token build provenance | PASS | Exporter compares actual compiler input to reviewed source and records SHA-256/compiler settings. Preflight compares the current source with that provenance and reports creation/runtime hashes. This is not an independent security audit. |
| Token verification before configuration | PASS | Non-null token configuration is validated against exact runtime bytecode and expected metadata at a block with at least 12 confirmations. Live checkout is Mainnet-only and requires an explicit administrator request. |
| Unknown deployments | NOT TESTED globally | No known address was found in checked records/settings. Unknown external deployments cannot be excluded; the CLI still requires independent operator review and an explicit declaration. |
| Interrupted deployment safety | PASS | Known Mainnet records, uncertain records without addresses, temporary journals and stale locks fail closed. No record is automatically deleted to enable retry. No real interrupted transaction existed to reconcile. |
| Wallet ownership | NOT TESTED | Account observation is not cryptographic ownership proof. No signature was requested under the task restrictions. |
| RPC credential storage | PASS | The tracked endpoint was removed and the user supplied `TINANAI_MAINNET_RPC_URL` through Secrets. The restarted API and fresh read-only RPC checks succeeded. Provider-side rotation/revocation of the old credential is NOT TESTED; deleting a tracked variable cannot erase its repository history. |
| Responsive UI | PASS with correction | Browser verified desktop/iPhone stacking and readable checklist, but found a sticky save bar covering rows. The bar was changed to ordinary in-flow content and final frontend typechecking passed; a second browser run was not performed for this deterministic CSS fix. |
| Deployment/payment state wording | PASS | Infrastructure configured, token verified, payment configuration complete and checkout enabled are separate. Unknown token status never asserts that no token exists. |

## Last successful read-only Mainnet measurement

**Current post-Secret state, 2026-11-06T07:40:35.793Z: BLOCKED only by the
three mandatory wallet checks.** The user supplied the RPC through Secrets and
both API and frontend workflows were restarted. The fresh read-only command
confirms RPC, source, balance, gas, sufficient funds and configuration checks
pass; checkout remains disabled. CLI exit code 2 is expected because no
WalletConnect session is available to the Shell command.

Snapshot: **2026-11-06T07:40:35.793Z**, after secure Secret setup.
These are observations, not a future fee guarantee or transaction authorization.

| Check | Status | Result |
|---|---|---|
| Approved public deployer | PASS | `0x5D0435779b10234fD4941cc15fae8C7C86117E91` |
| Saved approval versus guarded CLI allowlist | PASS | Matched |
| Server RPC chain | PASS | Ethereum Mainnet, chain ID 1 |
| ETH balance | PASS | 0.036430630981695349 ETH |
| Estimated deployment gas | PASS | 553627 |
| Buffered gas limit | PASS | 664353, including 20% margin |
| Estimated cost | PASS | 0.000080484528850751 ETH |
| Maximum estimated cost at quoted fee cap | PASS | 0.000115897572699282 ETH |
| Sufficient balance for quoted maximum | PASS | Yes, at snapshot time |
| Wallet session/account/network | BLOCKED | No WalletConnect account was paired or supplied |
| Overall ready | BLOCKED | false; CLI exit code 2 |
| Existing on-chain token | NOT TESTED | No known address to verify; tokenVerified is null |
| Checkout disabled | PASS | true |

Creation bytecode hash:
`0x95594d289f5777b34ea9868fcaf824c537ff3e251846b6250152e6ab60ddb2f2`

Expected runtime bytecode hash:
`0x8f5e81a8fddf4446397077f8992d1789d76795c5cdaac0bb6441d2048af35d2a`

Token source remains unchanged: TinanAi / TINAN / 18 decimals / fixed 100,000,000
supply minted once to initialHolder, no additional minting or token-owner
administration. Mainnet workflow deploys Token only, not Core. No address has
been invented and no token is claimed deployed.

## Database and production

- PASS: Standard development Drizzle push changed the payment-settings default
  from 2 to 12. No table/column was added or removed.
- PASS: Development payment configuration is disabled with 12 confirmations;
  its low-count upgrade is audited.
- BLOCKED for release: Production's read-only snapshot still showed Sepolia,
  2 confirmations, disabled checkout, and missing token/treasury/rate. The latest
  application and default change must be published before claiming the new
  policy is live. Normal Publish handles the schema default; there is no
  startup DDL, custom production migration or direct production write.
- BLOCKED intentionally: Token, treasury and conversion rate remain unset.
  These are administrator inputs requiring real verified evidence, not defaults
  to invent during an audit.

## Tests

All completed automated runs passed: **97 tests**.

| Suite | Status | Count |
|---|---|---|
| Solidity and deployment protections, simulated local chain only | PASS | 19 |
| General backend unit tests | PASS | 37 |
| Administrator authorization/bootstrap/API integration | PASS | 6 |
| Payment validation, duplicates, credit allocation and failure refunds | PASS | 22 |
| Mainnet checklist, wallet/network mismatch, source and secret-safe errors | PASS | 11 |
| Frontend confirmation/readiness helpers | PASS | 2 |
| Workspace typechecking and Hardhat tool typechecking | PASS | — |
| API production bundle and frontend production build | PASS | — |

Browser verification used the actual development owner identity, not a
disposable substitute. Owner APIs returned 200. Invalid confirmation counts
2, 11, 101 and 12.5 were blocked by UI and returned 400 from the API without a
configuration write. Signed-out requests returned 401; a separate non-admin
received 403. Checkout stayed disabled. Production-owner browser verification
was NOT TESTED. The original validation attempt was interrupted by a workspace
restart; remaining checks were rerun serially with successful results.

## Changed files

Core backend:
- `artifacts/api-server/src/lib/tinan-mainnet-policy.ts`
- `artifacts/api-server/src/lib/tinan-mainnet-config.ts`
- `artifacts/api-server/src/lib/tinan-mainnet-preflight.ts`
- `artifacts/api-server/src/lib/tinan-mainnet-preflight.test.ts`
- `artifacts/api-server/src/lib/tinan-payment-chain.ts`
- `artifacts/api-server/src/lib/tinan-payment-store.ts`
- `artifacts/api-server/src/lib/tinan-payments.test.ts`
- `artifacts/api-server/src/routes/tinan-mainnet-admin.ts`
- `artifacts/api-server/src/routes/tinan-payments-admin.ts`
- `artifacts/api-server/src/scripts/mainnet-preflight.ts`
- `artifacts/api-server/src/index.ts`

Frontend:
- `artifacts/tinanai/src/components/mainnet-deployment-admin.tsx`
- `artifacts/tinanai/src/pages/payment-admin.tsx`
- `artifacts/tinanai/src/pages/payments.tsx`
- `artifacts/tinanai/src/lib/payment-readiness.ts`
- `artifacts/tinanai/src/lib/payment-readiness.test.ts`
- `artifacts/tinanai/package.json`

Contracts/build/schema:
- `lib/tinanai-contracts/scripts/export-abis.mjs`
- `lib/tinanai-contracts/scripts/mainnet-safety.ts`
- `lib/tinanai-contracts/test/MainnetDeployment.ts`
- `lib/tinanai-contracts/src/generated-token-artifact.ts`
- `lib/db/src/schema/tinan-payments.ts`
- `lib/api-spec/openapi.yaml`
- Regenerated React API client/Zod API types and token build artifacts.

Configuration/docs:
- Managed server environment configuration in `.replit` (no credential values
  are reproduced in this report): corrected catalog URL and removed the tracked
  RPC endpoint in preparation for secure replacement.
- `docs/tinanai-payments.md`
- This audit report and the standing payment-policy memory note.

## Required manual completion

1. PASS: RPC Secret supplied, workflows restarted and fresh read-only check
   succeeded. NOT TESTED: Provider-side rotation/revocation of the old credential.
   Confirm that externally and configure the published runtime appropriately.
2. BLOCKED: Publish the reviewed application/default change without overwriting
   production data. Test the actual production owner after authentication.
3. BLOCKED: Connect the approved WalletConnect account on Mainnet and rerun the
   UI preflight. No message or transaction signature is required for that check.
4. NOT TESTED: Independently review previous wallet/deployment history and any
   explorer records. Reconcile uncertain records before any separately approved
   deployment; never remove a journal simply to retry.
5. BLOCKED: Any token deployment requires separate, explicit approval and local
   external-wallet confirmations. This audit grants no transaction permission.
6. BLOCKED intentionally: Only after real deployment and independent verification
   may an administrator supply the real token address, treasury and rate, run
   separately approved live-payment tests, and explicitly activate checkout.
