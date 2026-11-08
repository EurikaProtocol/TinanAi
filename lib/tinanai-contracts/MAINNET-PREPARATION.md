# New separate TinanAiToken — preparation only

This is a NEW target, not a migration, replacement or adoption of either:

- `0x2907A8aB668AD053dE5614C861a080929B4a887f`
- `0x7Fa0393B56629791736aB365dd9849775f955Cd2`

Both historical TINAN contracts exist and remain unchanged. EUREKA/Core is out of scope.
The immutable reviewed identity and exact declaration are in `src/mainnet-identity.ts`.
Any source/creation/runtime hash mismatch blocks deployment pending a new review.
The model remains TinanAi / TINAN / 18 decimals / one constructor mint of 100,000,000.
The constructor's initialHolder must equal the saved, allowlisted deployer.

## Read-only path

Use `/mainnet-preparation`, NOT `/payments/admin`, for isolated preparation.
The standalone page does not call payment account/catalog/admin loaders, which
can initialize records, migrate confirmations or expire invoices.

1. Sign in as an existing payments administrator. No new admin is created.
2. Inspect saved deployer approval. The page offers no save/approval mutation.
3. If an existing wallet session is available, use **Read existing wallet session**.
   That observer requests only `eth_accounts` and `eth_chainId`. Require the
   `walletConnect` connector, matching saved address and chain ID 1.
   No pairing, signature or transaction permission is requested by this button.
   Account/chain changes and disconnect/delete/expiry invalidate observations.
   Connection is not cryptographic ownership proof.
4. Use **Read server RPC diagnostics** only when a real read is authorized.
   `GET /api/tinanai/payments/admin/mainnet/diagnostics` retains the existing
   Clerk + administrator gates and no-store headers. It performs SELECT-only
   approval lookup and reads chain ID, latest block number/hash/time, block-pinned
   balance and confirmed nonce, plus a separate pending nonce. RPC URLs and raw
   exceptions never appear in responses. It cannot estimate gas or initialize payments.
5. Inspect source, allowlist and journal checks independently of billing readiness.
   The gas check stays BLOCKED: no aggregate green status grants transaction authority.

The former POST preflight returns 409 without an audit insert or simulation.
The legacy preflight helper no longer estimates gas either.

## Production billing is NOT changed or authorized

- Production payment chain ID `11155111 -> 1`: **NOT APPROVED / NOT APPLIED**.
- Production payment confirmations `2 -> 12`: **NOT APPROVED / NOT APPLIED**.
- Checkout stays disabled. Treasury, rate, rate source and payment-token address
  remain unset. No historical contract is assigned to billing.
- Deployment gating SELECTs these fields and refuses changed billing state;
  it never clears, initializes, upgrades or populates them.
- The existing CLI's 12-block receipt wait is not a production-settings update.

## Gas simulation: separate permission, disabled by default

The page has a disabled control and no gas endpoint. Read-only diagnostics do not
call `estimateGas`, `eth_call`, fee estimation, wallet signing or sending methods.

The low-level estimation helper refuses to make any RPC call without the exact
separate simulation authorization. The deployment wrapper requires the explicit
`--authorize-creation-simulation` opt-in before compilation, wallet pairing or locks.
The authorization is per invocation, not a saved production environment toggle.
This flag permits the simulation step only; it is not transaction approval.

**Do not run deployment or verification commands during preparation.** Their
wrappers compile artifacts. No build, compile, verify, simulation, live diagnostic,
wallet pairing, signature, broadcast or transaction was run to prepare this change.

## Future deployment, only after separate explicit authorization

Before any future invocation, independently review the exact source/runtime hashes,
deployer/initialHolder, live Mainnet RPC and wallet, available balance, pending nonce
and all known records for this NEW target. Then separately authorize creation-code
simulation and review a fresh gas quote, 20% gas-limit margin, EIP-1559 caps and
maximum ETH cost. Deploy only TinanAiToken, transaction value zero, never Core.

The human declaration explicitly says CREATE NEW SEPARATE TinanAiToken and includes
the exact reviewed source SHA-256 and runtime Keccak-256. It no longer denies the
existence of historical TINAN contracts. A second transaction-specific confirmation
and external wallet approval remain required.

Preserve the dedicated mainnet.json and lock guard. An existing dedicated manifest,
unknown Mainnet record, uncertain submission or temporary journal blocks another
attempt. Only unambiguous confirmed historical records in other files are classified
as separate; a record claiming this target or hashes never gets that exception.
No existing records are rewritten to obtain permission.

The prepared new journal binds targetId, source hash, creation/runtime hashes,
initialHolder and preserved historical identities before requesting a transaction.
Submission uncertainty and rejected transactions keep their records; never retry
automatically or delete a lock/journal to get past a failure.

After an independently authorized deployment: verify receipt, address, exact runtime,
metadata, supply and initial mint recipient, then independently verify explorer source.
Payment-token selection and checkout activation require separate approval.

## Allowed offline checks for this preparation

Use direct Node tests only; do not use package wrappers that chain compile/build:

```sh
node --experimental-strip-types --test \
  lib/tinanai-contracts/test/MainnetPreparation.test.ts \
  artifacts/api-server/src/lib/tinan-mainnet-diagnostics.test.ts \
  artifacts/api-server/src/lib/tinan-mainnet-readonly-boundary.test.ts \
  artifacts/tinanai/src/lib/wallet-observation.test.ts
```

These tests read existing source/artifacts and exercise pure guards, fake RPC clients,
and a fake event-driven wallet. No test writes journals/files, starts the app, opens
a browser, connects a real wallet, uses a live RPC or invokes an estimation method.
