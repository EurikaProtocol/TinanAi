# TINANAI COIN payments

## Delivery status

Implemented inside the existing TINANAI website:

- `/payments`: server-owned token configuration, live read-only token information,
  wallet/network status, administrator-set EUR pricing and TINAN conversion rate,
  expiring quotes, wallet ownership signatures, explicit direct-transfer review,
  balance/simulation/gas checks, transaction-hash recovery, server-confirmed
  payment history and service credits.
- `/payments/admin`: server-authorized configuration, all six service prices and
  payment policies, latest 200 payments including failures, all-record CSV export,
  and manual marketplace fulfillment/rejection.
- PostgreSQL-backed invoice, challenge, credit, usage, administrative role,
  marketplace request and configuration-audit records.
- Server receipt verification and background reconciliation, independent of the
  browser. No payment becomes confirmed from a frontend callback.

**Not activated:** the user confirmed that the existing TINAN contracts are not
deployed. Payments therefore start disabled, without token/treasury addresses,
prices or a conversion rate. No public-chain payment or deployment has been
performed. Wallet ownership signing and real token transfers still require a
future explicitly approved deployed configuration and live-wallet acceptance test.

## Existing token

`lib/tinanai-contracts/contracts/TinanAiToken.sol` is reused without modification.
It inherits OpenZeppelin ERC20, has name `TinanAi`, symbol `TINAN`, 18 decimals,
and mints exactly 100,000,000 tokens in its constructor. There is no additional
mint entry point. No new token, payment contract, factory or address was created.
EUREKA/EURIKA contracts and configuration are unchanged.

## Payment architecture

1. Clerk authenticates the account independently of its connected wallet.
2. The server issues a random five-minute wallet ownership challenge, bound to
   the authenticated account, payer and configured chain. The signature is not
   a token approval or transfer; signatures are verified, not stored.
3. An atomic, one-use challenge redemption creates a unique 15-minute invoice.
   Its payer, chain, token, treasury, integer euro cents, decimal TINAN-per-EUR
   rate, source, atomic token amount, confirmation policy, issue block and expiry
   are immutable snapshots. Later admin changes do not rewrite existing quotes.
4. The user separately reviews the invoice. The browser checks the selected
   wallet/chain, token and native balances, simulates `transfer`, estimates gas
   and requires another explicit click to request the wallet transaction.
5. Payment uses **direct ERC-20 `transfer(treasury, exactAmount)`**, with zero native
   transaction value. There is no spender contract, so **allowance and approval
   are not required** and no unlimited approval is requested. The paying wallet
   still needs ETH for network gas; this implementation does not sponsor gas.
6. The browser saves the broadcast hash before asking the server to verify it.
   A storage failure is disclosed if recovery is needed; a missing server hash
   can be supplied manually, including for an expired quote that was actually
   paid within its original block-time window.
7. The server reserves `(chain ID, transaction hash)` under a unique DB constraint.
   It verifies the RPC chain, canonical receipt block, successful status, original
   transaction sender/target/value/calldata, and exactly one matching token
   Transfer log from the invoice payer to its treasury for its exact amount.
   Transactions from before the issue block or outside the invoice payment
   window cannot satisfy the invoice. Pending and unavailable RPC results never
   become fabricated success or zero balances.
8. Only sufficient canonical confirmations atomically set `confirmed` and grant
   one service credit. The policy minimum is 12 confirmations on both supported
   networks, with an integer configuration range of 12–100. Legacy low-count
   invoice verification uses an effective minimum of 12.
   Repeated and concurrent verification cannot grant a second credit.
9. A 30-second server reconciler processes submitted pending/confirming invoices
   even with the browser closed. Its oldest-check-first queue prevents one
   unknown hash from permanently excluding later invoices. No signing key is
   used. The page additionally checks its in-flight invoices every 15 seconds.

Amounts use integer/BigInt arithmetic. Conversion rounds **up** to the smallest
atomic token unit; it never uses binary floating-point numbers for a binding
quote. The displayed administrator-set rate is not a market valuation, exchange
listing or appreciation promise.

### Statuses and limits

- `created`: immutable quote, no submitted hash.
- `pending`: hash recorded, no mined matching receipt yet.
- `confirming`: matching receipt, insufficient confirmations.
- `confirmed`: verified payment; exactly one service credit granted.
- `failed`: reverted or mismatched receipt; no credit.
- `expired`: no submitted hash before quote expiry. Recovery still checks the
  original chain inclusion time, not the time the verification request arrives.

A transfer made late, for the wrong amount/token/network/recipient, or with a
wrong account does not unlock anything. Transactions are irreversible; this
system does not automatically send token refunds. Such payments require manual
review and a separately approved refund transaction. An invoice with an attached
hash cannot be silently switched to another hash.

The token gate checks exact compiled runtime-bytecode equivalence and expected
metadata/supply at a block with at least 12 confirmations. Live checkout is
Mainnet-only and still requires an explicit administrator activation request.
**This is not explorer source verification or an independent contract audit.**
Before enabling checkout, independently confirm that the
address really is the existing, reviewed fixed-supply TINAN deployment.
Confirmation counting reduces reorganization risk but does not guarantee
irreversibility; deep reorgs after a credit is granted need operator review.

## Read-only Mainnet readiness

`pnpm --filter @workspace/api-server run mainnet:preflight` returns every
mandatory check as PASS, FAIL, or BLOCKED and labels unperformed independent
checks NOT_TESTED. A missing wallet still blocks readiness, but balance/gas
estimation for the administrator-approved public address is safe to perform
without a wallet. No signature, wallet permission request, or transaction is
made by the command. Gas limits include a 20% margin; fee quotes can change.

The reviewed Token source is compared with SHA-256 provenance from the actual
compiler input, alongside compiler settings and bytecode hashes. This establishes
build provenance, not ownership, global deployment absence, or a security audit.
Known token addresses receive exact-runtime and metadata read-back. Unknown
external deployments require independent operator review; interrupted journals,
temporary records, and locks are never automatically removed to permit retries.

The UI distinguishes infrastructure configuration, verified token deployment,
completed payment configuration, and enabled checkout. No known verified token
address means unknown, not proof that no token exists.

Existing payment confirmation counts below 12 are raised once with an audited
revision increment during payment initialization. Only the confirmation count
and revision change; checkout is not activated. The development schema default
is 12. Production receives that default through the normal Publish schema flow;
there is no startup DDL or custom production schema migration.

Keep credential-bearing RPC endpoints in Replit Secrets, never in tracked
configuration or VITE-prefixed variables. A provider credential previously kept
in tracked configuration must be rotated and replaced through the secure Secrets
flow; deleting the current variable does not erase its repository history.

## Actual service activation

All six services have persistent pricing and account credits. No existing free
feature becomes paywalled just because this code was installed. Every service's
`requiresPayment` defaults to false; charging is an administrator opt-in.

| Service | Protected operation / delivered unit |
|---|---|
| AI Builder | One Builder-mode assistant request, or analytics/JSON Builder generation |
| AI Agents | One accepted engineering-agent run on an owned project |
| App generation | One website/application generation request |
| Contract generation | One token-contract draft generation request |
| Data Tokenization | One AI tokenization planning request at the existing Tokenization tool |
| Marketplace | One persisted request for manual administrator fulfillment |

Paid AI gates reserve a confirmed credit in a DB transaction with row locking;
parallel requests cannot use the same credit twice. Existing validation,
ownership checks, rate limits and AI behavior remain in place. Synchronous HTTP
failures restore that reservation once. Accepted asynchronous agent runs consume
the credit even if their later work fails: the priced unit is the accepted run,
not a guaranteed model outcome.

Marketplace submission always requires an actual confirmed marketplace credit,
then consumes it and stores a request. An authorized admin can provide a response
and mark it fulfilled, or reject it and restore exactly one credit. Repeated
resolution is rejected. This is **manual service fulfillment**, not an automated
asset exchange, escrow, mint, or marketplace purchase.

The existing browser-local Data Studio remains a proposal editor. A paid planning
credit does not enable its disabled factory deployment, issue tokens, enforce
data rights, or pay for hosting. Existing Launchpad and proof features are not
silently expanded or billed.

If the server crashes after reserving a service credit but before finalizing the
HTTP result, the reservation remains auditable in `tinan_payment_usage`.
Operators must review orphaned `reserved` usage; it is not silently refunded
because the work may have run. Failures to finalize reservations are logged.

## Administration and activation checklist

1. Apply the additive payment tables to the **development** DB:

   ```sh
   pnpm --filter @workspace/db run push
   ```

   This was done for development. No production DB changes were made. Review
   schema changes and apply through the approved publishing/migration process
   before running this code against production. Missing payment storage fails
   closed rather than bypassing billing checks.

2. Establish the first admin from an owner-controlled shell, after the intended
   existing Clerk account has a verified email:

   ```sh
   # Read-only: resolves the verified account without printing its email or raw user ID.
   pnpm --filter @workspace/api-server run payments:admin --environment=development --email=YOUR_VERIFIED_EMAIL
   # Review the status, then copy the complete ownerConfirmation reference:
   pnpm --filter @workspace/api-server run payments:admin --environment=development --email=YOUR_VERIFIED_EMAIL --grant --confirm-owner=sha256:REFERENCE_FROM_CHECK
   # Revocation:
   pnpm --filter @workspace/api-server run payments:admin --environment=development --email=YOUR_VERIFIED_EMAIL --revoke --confirm-owner=sha256:REFERENCE_FROM_CHECK
   ```

   `ownerConfirmation` is a SHA-256 reference bound to the resolved account and
   environment. It is pseudonymous, not anonymous or a grant credential; keep
   operator output private. The legacy `--confirm-user-id` remains supported
   for an independently verified Clerk ID, but raw IDs are no longer printed.
   Never supply both confirmation options. Status output contains only the
   reference, environment, operation and explicit boolean status fields.
   Provider/database error details are never printed; only exact approved
   operator messages are allowed. Do not paste operator arguments or output
   into public logs; the existing `--email` argument is visible in local shell
   history/process listings and belongs only in the trusted operator runtime.

   The script resolves the account in the current Clerk environment, verifies its
   email and writes an application DB role/audit record. It does not create users,
   pick the first signup as admin, require a shared password, or copy development
   identities into production. Run deliberately in each intended environment.
   Grant and audit commit in one transaction. Concurrent/repeated grants do not
   create duplicates, and rerunning bootstrap never restores a revoked or
   previously consumed grant. Revocation is also audited. No email address,
   wallet, Clerk metadata claim, or browser-provided role independently grants access.

   **Production:** Do not use the development account ID or copy production
   credentials into the workspace. In production-only server environment settings,
   set `TINANAI_PAYMENT_ADMIN_BOOTSTRAP_EMAIL` to the explicitly designated owner's
   verified sign-in email and `TINANAI_PAYMENT_ADMIN_BOOTSTRAP_ENABLED=true`.
   Publish the application code through the normal reviewed Publish flow.
   At API startup the opt-in bootstrap resolves the existing active account in
   production Clerk, verifies its email, and records the one-time DB grant.
   This is application data initialization only: no DDL, migration, token
   configuration, wallet request, or blockchain operation is performed.
   Disabled by default; a test Clerk instance or non-production runtime is rejected.
   Missing/unverified/banned/locked accounts receive no privileges and a generic
   failure is logged without credentials.

   After publication, authenticate as the actual owner on the published domain
   and verify `/payments/admin`, Mainnet approval persistence, and read-only
   preflight. Check the role/audit in that environment; then remove the two
   bootstrap variables or disable the flag. Startup will never regrant a
   previously revoked role even if the flag is accidentally left enabled.
   In a separately authorized production operator runtime the same CLI supports
   `--environment=production` with that runtime's resolved ID. Never run it against
   production from the development workspace.

   A successful development grant or disposable-account test is **not** evidence
   that the actual authenticated production owner has access.

3. Deploy the existing TINAN suite **only after separate explicit approval**.
   Do not deploy a duplicate token if one already exists; preserve any partial
   deployment transaction checkpoints and verify existing deployments first.
4. Independently verify the deployed token address, source/runtime, 100M supply
   and the intended treasury. Open `/payments/admin`; select its actual network.
   Set the token and treasury addresses, EUR service prices, an administrator-set
   positive TINAN-per-EUR rate, a clear source/rationale and confirmation policy.
5. Keep checkout disabled while reviewing pricing, service descriptions and
   `requiresPayment` flags. Enabling a policy affects the protected operations
   above, not unrelated routes. The admin must explicitly save the change.
6. Enabling checkout checks the network, deployed code and token metadata/supply.
   Quote creation checks those again. Never enter local/mock test addresses as
   public production configuration.
7. Obtain separate approval for a real-wallet Sepolia acceptance test, including
   spending testnet ETH for gas. Verify quote/signature, user rejection, transfer,
   confirmations, exactly one backend credit, service usage and account isolation.
   Then review production policies before a separately approved Mainnet launch.
8. Verify Reown origin restrictions, public RPC reachability, Clerk environments,
   database backups, supported wallet types and real-device pairing. Production
   and development have independent accounts, roles and DB data.

No new API key, private key, seed phrase, paid rate provider or custody system is
required. Existing Clerk, PostgreSQL, wagmi/viem and Reown infrastructure is reused.
Public RPC availability is an external dependency; there is no market-price feed.

## Security and persistence

- Private invoices/credits/orders require Clerk account authentication.
- Admin APIs check the application's DB admin role on the server.
- Mutating payment APIs additionally require a validated Clerk bearer request,
  avoiding ambient-cookie-only cross-origin writes.
- Wallet ownership challenges expire and can be redeemed only once, atomically.
- User fields cannot set owner, quoted amounts, confirmations or payment status.
- Every receipt must match the original invoice and its selected network.
- Database uniqueness and row locks protect replay, duplicate confirmation,
  simultaneous spending and repeated marketplace refunds.
- Administrative configuration uses optimistic revisions and audit records.
- Account-scoped queries, cache clearing on auth changes and dialog resets keep
  payment sessions separate. Browser storage contains only transaction hashes,
  not wallet secrets; server invoice records are authoritative.
- History shows the latest 100 account invoices / 200 admin invoices. CSV export
  pages through all records and quotes cells to prevent spreadsheet formulas.
- Public snapshots are reads; transaction writes exist only in the explicit
  wallet confirmation handler. No approval or signing action runs on page load.

## Files created / modified

Created:

- `lib/db/src/schema/tinan-payments.ts`
- `artifacts/api-server/src/lib/tinan-payment-chain.ts`
- `artifacts/api-server/src/lib/tinan-payment-store.ts`
- `artifacts/api-server/src/lib/tinan-payment-verification.ts`
- `artifacts/api-server/src/lib/tinan-payment-gate.ts`
- `artifacts/api-server/src/lib/tinan-payment-reconciler.ts`
- `artifacts/api-server/src/lib/tinan-payments.test.ts`
- `artifacts/api-server/src/routes/tinan-payments.ts`
- `artifacts/api-server/src/routes/tinan-payments-admin.ts`
- `artifacts/api-server/src/routes/tinan-payments-marketplace.ts`
- `artifacts/api-server/scripts/payment-admin.mjs`
- `artifacts/api-server/scripts/test-payments.mjs`
- `artifacts/tinanai/src/lib/use-tinan-payments.ts`
- `artifacts/tinanai/src/components/payment-ui.tsx`
- `artifacts/tinanai/src/components/payment-marketplace.tsx`
- `artifacts/tinanai/src/pages/payments.tsx`
- `artifacts/tinanai/src/pages/payment-admin.tsx`
- `docs/tinanai-payments.md`

Modified:

- `lib/db/src/schema/index.ts` (schema export)
- `lib/api-spec/openapi.yaml` and regenerated API-client/Zod outputs
- `artifacts/api-server/package.json` / `pnpm-lock.yaml` (existing-version viem
  dependency and payment test/admin commands)
- `artifacts/api-server/src/index.ts` (read-only reconciler startup)
- `artifacts/api-server/src/routes/index.ts` (payment router)
- Existing `tinanai.ts`, `tinanai-builder.ts`, `tinanai-agent-runs.ts` routes
  (opt-in server credit gates)
- TINANAI `App.tsx` / `components/shell.tsx` (new lazy routes/navigation)

## Verification

Commands:

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run test:payments
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/tinanai run test
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/tinanai run build
```

- 21 new payment checks passed: exact conversion, malformed inputs, token/network
  validation, canonical confirmations, pending/RPC failure, reverted/mismatched/
  late transfers, signatures, CSV safety, real development-DB account isolation,
  transaction uniqueness, concurrent spending, exactly-once refund and admin roles.
- 37 pre-existing API regression checks and 68 website checks passed.
- Workspace library/artifact/script typechecks passed; both changed applications'
  production builds passed. The website build retains existing large-wallet-chunk
  warnings; those warnings do not indicate a failed build.
- Public `/payments` screenshot verified; public catalog contains no invented
  addresses, rate or live metrics. Signed-out account/admin API requests return 401.
- Signed-in browser pass **succeeded**: real Clerk-authenticated account calls;
  non-admin UI/API denial; temporary test-admin configuration edit, reload,
  validation and CSV download; 390px layout/navigation; synthetic marketplace
  credit redemption through the real UI, persisted request, rejection/response,
  exactly-once credit restoration, repeated-resolution 409; second-account
  isolation and cross-account invoice-verification 404; existing Contracts and
  Data Studio routes still available.
- Browser fixtures were explicitly synthetic and involved no funds. The original
  configuration was restored (only its audited revision increased), test payment
  records and the temporary admin role were removed, and checkout remains
  disabled with no addresses, prices or rate. Test-only authentication identities
  and the legitimate administrative save/restore audit trail were retained.

The payment tests use mocked chain data and explicitly labelled, cleaned-up
development DB records. Local ephemeral signing keys exist only inside tests.
They are not public-chain evidence. **A live token payment, real wallet signing,
Mainnet/Sepolia transaction submission, real-device pairing, deployment and a
security audit have not been performed by this work.**
