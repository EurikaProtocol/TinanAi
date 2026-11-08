# TINANAI / EurekaCore: production readiness and WalletConnect

Date: 2026-11-06. Overall result: **BLOCKED**.

This report supplements `tinanai-mainnet-readiness-audit.md`. Its production
readiness rules supersede the earlier token-deployment-preparation-only meaning
of `ready`. No production publication or production configuration mutation was
performed.

## Root causes and repairs

| Finding | Status | Evidence / correction |
|---|---|---|
| WalletConnect action opened a generic connector picker | PASS — repaired | A browser-extension or Coinbase connection could appear connected but fail the required WalletConnect connector check. The dedicated action now uses AppKit 1.8.24's public `ConnectingWalletConnectBasic` flow. |
| Connection action hidden after any wallet connected | PASS — repaired | An incorrect connector could prevent the admin from seeing a route back to WalletConnect. Connection, refresh and explicit disconnect controls are now visible with actionable instructions. No session is disconnected automatically. |
| Provider observation and lifecycle were incomplete | PASS — repaired | Existing provider account and chain are read with `eth_accounts` / `eth_chainId`, strictly validated and compared with active connector state. Account/chain changes and disconnect/deleted/expired events invalidate observations and in-flight results. |
| Stale responses could outlive a session | PASS — repaired | Synchronous live-observation guards, generations and before/after-server provider reads prevent late success after a switch or expiry. Refresh cannot resurrect an expired observation. |
| Provider exceptions could contain private pairing data | PASS — repaired | Observation errors are generic and never echo pairing URIs; WalletConnect relay failures get actionable UI guidance. |
| Build-only readiness could pass without a token/payment setup | PASS — repaired | Exact on-chain token verification, Mainnet payment network, token address, recipient, positive atomic-unit quote/rate source and complete payment configuration are now mandatory production checks. Unknown deployment stays NOT TESTED and blocks readiness. |
| Existing token versus new deployment were conflated | PASS — repaired | A known address blocks *new deployment* while allowing verification of the existing token for payment readiness. Uncertain journals, temporary files and locks still block readiness; the independent CLI's duplicate-deployment guards remain unchanged. |
| Verification lacked durable audit evidence | PASS — repaired | Authenticated admin preflight saves a sanitized append-only snapshot in the existing protected audit table, including approval/payment revisions, exact expected bytecode hashes, checks, timestamps and confirmed-block metadata verification details when available. Wallet observations are explicitly not ownership proof. |
| No known Mainnet TINAN address | BLOCKED | Checked records contain local/template deployments, not a verified Mainnet TINAN address. Mainnet payment settings lack a token. This does not prove no unknown external deployment exists. |
| Production still serves earlier configuration | BLOCKED | Read-only public catalog still reports disabled checkout, Sepolia, 2 confirmations, and no token/recipient/rate. Workspace changes are not publication. |
| Published confirmation policy | FAIL | The observed production value 2 is below the required 12. Corrected code is verified in the workspace but requires separately authorized publication. |

These are verified code-level causes and corrections, not a claim that the
owner's particular previous mobile-wallet session was observed or paired.
The Reown project ID is configured; successful real mobile pairing and the
provider's production-origin policy still require administrator verification.

## Recorded development read-only Mainnet quote

Snapshot: **2026-11-06T08:03:39.696Z**. Quotes are temporary, not spending approval.

| Check | Result |
|---|---|
| RPC and Mainnet chain ID 1 | PASS |
| Saved approved deployer / guarded CLI allowlist | PASS |
| Source, compiler provenance and expected bytecode | PASS |
| Confirmation policy | PASS — 12–100 integers |
| ETH balance | PASS — 0.036430630981695349 ETH |
| Estimated gas / buffered limit | PASS — 553627 / 664353 |
| Estimated cost | PASS — 0.000101249850783319 ETH |
| Maximum quoted cost | PASS — 0.000145799663420655 ETH |
| Balance covers quoted maximum | PASS |
| Infrastructure configured | PASS |
| Token verified | NOT TESTED — unknown, not false proof of deployment absence |
| Payment configuration complete | BLOCKED |
| Checkout | PASS — disabled |
| Overall ready | BLOCKED — false, CLI exit 2 |

The Shell command reports **15 PASS / 0 FAIL / 8 BLOCKED / 3 NOT TESTED**.
There are nine mandatory checks open: eight BLOCKED plus the mandatory
NOT TESTED on-chain-token check.

### Remaining mandatory blockers

1. WalletConnect browser session not present in Shell.
2. Connected wallet account match not observed in Shell.
3. Connected wallet Mainnet network not observed in Shell.
4. Payment network remains Sepolia instead of Mainnet.
5. Mainnet payment token address missing.
6. Valid distinct recipient missing.
7. Positive conversion rate and its source missing.
8. Existing Mainnet token runtime/metadata not verified.
9. Complete verified payment configuration missing.

### Remaining NOT TESTED checks

- Cryptographic ownership of the approved wallet: no signature authorized.
- Independent external wallet/deployment-history review.
- Real Mainnet token runtime, metadata and confirmed-block verification because
  no approved known address is configured.
- Actual mobile-wallet pairing and production browser account access.

## Token scope and payment verification

The payment implementation is for **TinanAi / TINAN / 18 decimals /
100,000,000 fixed supply**. Matching runtime establishes the expected contract
implementation, including no extra minting or token-owner administration.
Compiler output alone is never evidence of deployment.

The separate existing EURIKA token and proof-registry addresses must not be
inserted as the TINAN payment token or compared with the TINAN artifact as if
they were the same contract. No EURIKA contract, setting or ABI was changed.
The intended TINAN address must come from reviewed existing deployment evidence
and explicit administrator configuration, not an address invented by this task.

The server requires exact runtime and metadata at a block with at least 12
confirmations. Direct ERC-20 transfers use integer atomic-unit amounts and
server-side exact receipt/transaction checks. No additional payment contract
is used. Duplicate transaction protection, credit allocation and failure
refund handling remain covered by existing tests. No unverified transaction
was accepted and checkout was not enabled.

## Files changed

- `artifacts/tinanai/src/lib/wallet-observation.ts` — provider reads and event lifecycle.
- `artifacts/tinanai/src/lib/wallet-observation.test.ts` — lifecycle/security regression tests.
- `artifacts/tinanai/src/lib/web3-wallet.tsx` — AppKit flow and observed live session state.
- `artifacts/tinanai/src/components/mainnet-deployment-admin.tsx` — connection controls,
  explicit wallet checks and eleven labelled dashboard/audit sections.
- `artifacts/tinanai/package.json` — include provider tests in readiness suite.
- `artifacts/api-server/src/lib/tinan-mainnet-preflight.ts` — production readiness,
  separate duplicate-deployment status, confirmed-journal rules and verification details.
- `artifacts/api-server/src/lib/tinan-mainnet-preflight.test.ts` — production/token/payment/journal regressions.
- `artifacts/api-server/src/routes/tinan-mainnet-admin.ts` — protected sanitized audit persistence.
- This report, the earlier audit's supplement link and payment-safety memory rationale.

**Database migrations: NONE.** Evidence uses the existing audit table.
**Secrets/environment/DNS/approved deployer changes: NONE.**
**Solidity/tokenomics/deployment-script changes: NONE.**

## Automated verification

All **177 tests** passed:

| Suite | Tests |
|---|---:|
| Backend unit | 37 |
| Payment verification/duplicates/credits/refunds | 22 |
| Admin authorization | 6 |
| Mainnet readiness, token/payment verification and journal safety | 15 |
| Frontend existing unit suites | 68 |
| Frontend readiness/provider lifecycle and privacy | 10 |
| Solidity/deployment safeguards, local simulated chain only | 19 |

Library/application typechecks and contract-tool typechecking passed.
API and frontend production builds passed. A parallel workspace typecheck was
interrupted by an environment restart; completed checks were run serially.
Mocks are unit-test fixtures only, not claims of real wallet pairing or
deployed-contract verification. No independent Solidity security audit or
new dependency vulnerability scan was performed.

## Browser verification

**PASS**, using the actual existing audited development owner's Clerk identity,
not a replacement administrator. API preflight returned 200 after protected
audit persistence. All eleven labelled sections were confirmed after correcting
the initial missing semantic `Preflight Audit` section.

- PASS: Desktop WalletConnect action opened the SDK's usable QR/picker flow
  without an actionable relay/origin error. The tester closed it without
  selecting a wallet, copying a pairing link or pairing/signing.
- PASS: After dismissal, Connect remained usable, refresh was disabled without
  a session, no account/network/authorization was claimed and readiness stayed blocked.
- PASS: iPhone-sized 390×844 layout had readable wrapped statuses, no page-level
  horizontal overflow, and no save-bar overlap. The top navigation retains its
  own horizontal scrolling.
- PASS: A separate signed-out browser context showed Sign in required with no
  administrator controls.
- NOT TESTED: Real mobile pairing, approved-account/network readback after real
  pairing, cryptographic ownership, and production-owner browser authentication.
  Account/network switch and expiry behavior passed provider-fixture unit tests,
  not real-wallet lifecycle tests.

Dashboard-only screenshots were recorded; no pairing QR/URI was captured.
Non-blocking Reown font-preload/component-update warnings were observed.
The same browser tester continued only the unfinished checks after the initial
section-count correction; no real transaction or wallet pairing was attempted.

## Exact administrator steps

1. Review the changes and separately authorize publication. Publish manually;
   verify the existing actual production owner can open `/payments/admin` and
   that production now enforces 12–100 confirmations. Do not overwrite live data,
   credentials or the saved deployer as part of publication.
2. On the intended production origin, sign in as the existing authorized admin.
   Inspect the saved approved deployer; do not change it.
3. If another connector or expired session is active, select **Disconnect wallet**.
   Select **Connect WalletConnect** and complete pairing in the administrator's
   own wallet. If Reown rejects the origin, review the project's origin policy
   through the authorized provider account; do not replace working credentials.
4. Select the approved public wallet account and Ethereum Mainnet chain ID 1.
   Use **Refresh wallet session** and inspect independently observed account,
   connector and network, then **Run read-only preflight**. No signature,
   transaction or deployment is required.
5. Independently reconcile deployment history and uncertain records. Supply a
   real existing TINAN address only after reviewing its provenance; verify exact
   runtime and metadata. Never delete journals merely to permit another attempt.
   If no token exists, deployment requires a separate explicit approval process.
6. After token verification, separately approve the real recipient, positive
   rate/source and Mainnet payment configuration. Keep checkout disabled.
7. Only under a later explicit authorization may live-payment tests or checkout
   activation be performed. This task does not authorize either.

## Execution boundaries

No blockchain transaction was signed or broadcast by this task.
No real ETH or other funds were spent by this task.
No token or contract was deployed. No duplicate contract was created.
No live checkout/payment activation, DNS mutation, credential rotation,
production-secret update or approved-deployer change was performed.
