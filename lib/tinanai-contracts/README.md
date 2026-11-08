# TinanAi smart contract suite

An independent Hardhat 3 workspace package inside the existing TINANAI project.
This prepares a **new** Token/Core deployment; it does not replace the existing
Launchpad token template, connect the frontend automatically, modify EUREKA
Mainnet addresses, or designate an official platform token.

**No Sepolia transaction has been submitted by creating this package.**
Compilation, local tests, and local deployment are not a security audit.

> **New separate Mainnet token preparation:** see [MAINNET-PREPARATION.md](MAINNET-PREPARATION.md).
> It supersedes the older Mainnet catalog/preflight instructions below. Historical
> TINAN contracts exist but are not the new deployment identity. Do not run compile,
> deployment, verification or simulation commands during read-only preparation.

## Contracts

### `contracts/TinanAiToken.sol`

- ERC-20 built on OpenZeppelin Contracts.
- Name **TinanAi**, symbol **TINAN**, decimals **18**.
- Exactly **100,000,000 TINAN** (`100000000000000000000000000` base units).
- Constructor: `constructor(address initialHolder)`.
- The full supply is minted once to `initialHolder`; the zero address is rejected.
- No external mint/burn, token-owner role, fees, blacklist, pause or upgradeability.
  Ordinary transfers and allowances do not change total supply.

### `contracts/TinanAiCore.sol`

- `Ownable` registry with an immutable `IERC20 token` link.
- Constructor: `constructor(address tokenAddress, address initialOwner)`.
- The token address must be nonzero with deployed code. The constructor alone
  does not certify that an arbitrary address is an authentic TINAN token.
- Only the current owner can call
  `registerProof(bytes32 contentHash, string uri, string label)`.
- `getProof(uint256 proofId)` is public and returns:

  ```ts
  {
    contentHash: `0x${string}`;
    uri: string;
    label: string;
    submitter: `0x${string}`;
    timestamp: bigint;
  }
  ```

- IDs start at 1. Zero hashes, duplicate hashes and invalid IDs revert.
- URI length is at most **512 UTF-8 bytes**; label length at most **128 bytes**.
  Empty URI/label are allowed.
- `ProofRegistered` emits the ID, hash, submitter, metadata and block timestamp.
- `proofCount()` and `proofIdByHash(bytes32)` support lookups.
- Proofs are append-only: no edit/delete function is provided.
- The intended document digest is SHA-256 of the original bytes; the EVM cannot
  verify which bytes you hashed or whether a URI contains truthful content.
- Linking Token does **not** charge a fee, transfer/approve tokens, confer
  ownership of data, or give token holders registration permission.
- Ownable's transfer/renounce operations are available. **Renouncing ownership
  permanently disables new proof registration** while existing records remain readable.

Never put private documents, credentials or personal data in public metadata.

## Layout

```text
lib/tinanai-contracts/
  contracts/                  Solidity source
  hardhat.config.ts           Local Hardhat and Sepolia only
  test/TinanAi.ts              Actual local-EVM tests
  scripts/deploy.ts            Deployment entry point
  scripts/deploy-suite.ts      Sequential deployment and checkpoint/resume
  scripts/wallet-connect.ts    External wallet signing, memory-only session
  scripts/export-abis.mjs      JSON and typed ABI generation
  abi/TinanAiToken.json        Exported ABI
  abi/TinanAiCore.json         Exported ABI
  src/index.ts                Frontend-safe exports, no Hardhat import
  src/generated-abis.ts        `as const` ABIs for viem/wagmi inference
  deployments/                Public deployment manifests; no private keys
  generated-artifacts/        Ignored Hardhat build output and cache
```

Dependencies are installed through the existing pnpm workspace. Use Node.js 24+
and the workspace lockfile. Solidity uses the pinned local solc-js **0.8.38**,
optimizer **200 runs**, EVM target **Cancun**. OpenZeppelin is **5.6.1**.
No compiler download or public network is needed for tests.

## Compile, export ABIs and test

From the project root in Replit's Shell:

```sh
pnpm contracts:compile
pnpm contracts:test
pnpm --filter @workspace/tinanai-contracts run typecheck
```

`compile` refreshes both JSON ABIs and the typed ABI exports. The deployment
commands always compile/export first, so signing code uses the current ABI.
Use `pnpm install --frozen-lockfile` when restoring dependencies in a fresh checkout.

Tests execute Token/Core in a local EVM: fixed supply, transfers, constructor
guards, proof round-trip/event, access control, duplicate/zero hash rejection,
metadata bounds, ownership transfer and interrupted-deployment recovery.

## Local deployment rehearsal — no real ETH or wallet

```sh
pnpm contracts:deploy:local
```

This uses ephemeral Hardhat accounts and a simulated chain, **not Sepolia**.
It deploys Token first, reads its settings, deploys Core with the Token address,
then reads Core's linkage and owner. Results are written to
`lib/tinanai-contracts/deployments/local.json`.

The simulated chain ends when the process exits. Its addresses are not public
deployments and must not be pasted into Sepolia or the existing frontend config.
Never send real funds to Hardhat's deterministic development accounts.

## Deploy to Sepolia from Replit

This package intentionally does **not** use a private-key environment variable,
ask for a recovery phrase, or keep a signing key on the server.
Your own WalletConnect-compatible wallet signs each deployment.

### Prerequisites

1. A wallet supporting Ethereum Sepolia and WalletConnect, with enough Sepolia
   test ETH for **two deployments**.
2. A valid public Reown project ID in the project's `VITE_REOWN_PROJECT_ID`
   environment variable. The existing TINANAI WalletConnect configuration may
   already provide it. This identifier is not a wallet key.
3. Optional: set `SEPOLIA_RPC_URL` to a suitable HTTPS Sepolia RPC endpoint.
   The default is `https://ethereum-sepolia-rpc.publicnode.com`.
   Free RPC endpoints may throttle; never publish a provider credential.

Configure missing variables using the project's environment settings; never put
private keys in source files or paste them into chat. See Replit's
[Secrets/environment documentation](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
and [Shell documentation](https://docs.replit.com/features/workspace-tools/shell).

### Run

```sh
pnpm contracts:deploy:sepolia
```

The script:

1. Compiles the contracts and exports the ABIs.
2. Checks that the RPC chain is **11155111**.
3. Shows a WalletConnect pairing QR/URI in the Shell. Connect your wallet.
   **Treat that QR/URI as private session information; don't share its screenshot
   or paste it into chat.** Session state is stored only in memory, not on disk.
4. Shows the paired account. That account receives all 100M TINAN and becomes
   Core's initial owner.
5. Requires you to type **`DEPLOY SEPOLIA`** into the Shell.
6. Requests **Token deployment** approval in your wallet.
7. Saves its transaction hash immediately, waits for a successful receipt, and
   checks token name, symbol, decimals, total supply and nonempty code.
8. Requests **Core deployment** approval, passing the actual confirmed Token
   address and the paired account. No placeholder address is used.
9. Waits for its receipt and checks Core's token link, owner and nonempty code.
10. Saves the confirmed manifest and prints Sepolia Etherscan links.

Both wallet approvals are separate real Sepolia transactions and consume test
ETH. Nothing is sent before the Shell confirmation; the wallet must still
approve each transaction. **Mainnet and other public chains are rejected.**

The live pairing/approval path still needs a user-operated wallet test.
Local tests do not establish that a particular wallet, Reown project allowlist,
RPC provider or network is available.

## Ethereum Mainnet token-only deployment (prepared, not executed)

The guarded command below is for a later, separately approved operation. It was
not run as part of this preparation. This workflow deploys the existing
`TinanAiToken` only: it does not deploy `TinanAiCore`, modify EURIKA, enable
payments, or store a wallet private key.

### Required configuration

#### Exact setup in Replit (no deployment)

1. Sign in to TINANAI with an existing payments-administrator account. If owner
   setup is needed in development, run from the owner-controlled Shell:
   `pnpm --filter @workspace/api-server run payments:admin --environment=development --email=YOUR_VERIFIED_EMAIL`
   for a read-only identity check, then repeat with `--grant --confirm-user-id=ID_FROM_CHECK`
   after reviewing the resolved account. See `docs/tinanai-payments.md` for the
   explicitly enabled, one-time production bootstrap and audited revocation.
   This grants application administration only, not wallet ownership. Development
   and published accounts are separate; never copy development user IDs into
   production or run production administration from the development shell.
2. Open **Payments → Administration** (`/payments/admin`). In **Mainnet deployment
   preparation**, enter the owner-approved **public Ethereum wallet address** and
   select **Save deployer approval**. The server checks administrator access,
   audits the approval/revocation, and rejects stale revisions. Clear the field
   and save to revoke. This does not enable checkout.
3. In Replit **Tools → Secrets**, add `TINANAI_MAINNET_RPC_URL` with your HTTPS
   Ethereum Mainnet RPC URL. The value may contain provider credentials; never
   paste it into chat, the wallet-address field, or a client configuration.
   Do not create `VITE_TINANAI_MAINNET_RPC_URL`. This secret is read only by the
   API server and the guarded operator CLI; it is never returned by the API.
4. Set `TINANAI_MAINNET_AUTHORIZED_DEPLOYER` to the **same public address** and
   `TINANAI_MAINNET_PAYMENT_CATALOG_URL` to the full API catalog endpoint
   (`/api/tinanai/payments/catalog` on the intended environment's actual domain).
   Keep the existing public `VITE_REOWN_PROJECT_ID`. Do not set any private-key,
   seed-phrase, or recovery-phrase variable. The CLI also reads the existing
   server `DATABASE_URL` in read-only mode to verify the saved admin approval.
5. Restart the API Server workflow after changing server environment settings.
   For the published app, configure the corresponding production Secrets in
   **Publishing → Adjust settings**; development environment changes are not
   evidence of production configuration. Keep its checkout disabled.
6. Connect the approved account through WalletConnect locally, on Mainnet, and
   select **Run read-only preflight**. It uses only `eth_accounts` and
   `eth_chainId` in the wallet. Balance, chain verification, gas and fee estimates
   use the server RPC. The report never requests signatures, wallet permissions
   beyond an explicit local connection, token approvals, or transactions.
7. For an owner-controlled, read-only server check without connecting a wallet:
   `pnpm --filter @workspace/api-server run mainnet:preflight`.
   Exit code 2 means blocked/incomplete settings, not a failed deployment. This
   command uses SELECT queries only and does not initialize payment settings.
   With no wallet session it correctly reports wallet checks as missing.

The approved address is stored privately in the existing administrator audit
ledger, not in the public payment catalog. No database schema change is needed.
RPC responses/errors are sanitized; only configuration booleans, public
addresses, hashes and read-only estimates are returned. Client-reported wallet
observations are not cryptographic proof of ownership or permission to deploy.
The future deployment CLI rechecks the saved approval against its environment
allowlist before connecting and immediately before a wallet transaction request.
An unavailable approval database, revoked approval, or mismatch blocks sending.
Existing duplicate checks, journal locks, Shell confirmations, and external
wallet approval remain mandatory. Preflight does not authorize deployment.

Set these environment values before a future deployment:

- `TINANAI_MAINNET_RPC_URL`: HTTPS Ethereum Mainnet RPC endpoint. Configure it
  using Replit Secrets if it contains a provider credential.
- `TINANAI_MAINNET_PAYMENT_CATALOG_URL`: the existing API's read-only
  `/api/tinanai/payments/catalog` URL. The script requires a successful,
  well-formed response before connecting a wallet. If that registry already
  lists a token on chain ID 1, the command verifies that address and exits
  without deploying. A missing, invalid, or unavailable registry blocks sending.
- `TINANAI_MAINNET_AUTHORIZED_DEPLOYER`: the project-owner-approved public wallet
  address. The connected WalletConnect account must match it exactly.
- `VITE_REOWN_PROJECT_ID`: the existing public WalletConnect/Reown project ID.

No wallet key, seed phrase, or recovery phrase is requested or persisted. A
matching deployment journal or lock also blocks another deployment. The script
scans known deployment records, but those records cannot prove that no
unregistered Mainnet deployment exists, so it still requires the operator to
confirm that known project records have been checked.

### Verify a previously known address without deploying

This read-only command checks Mainnet chain ID, exact compiled runtime bytecode,
and the token's name, symbol, decimals, and total supply. It does not sign or
submit a transaction:

```sh
pnpm --filter @workspace/tinanai-contracts run verify:mainnet -- --address=0x...
```

Passing `--known-address=0x...` to `deploy:mainnet`, or setting
`TINANAI_MAINNET_KNOWN_TOKEN_ADDRESS`, also selects verification-only mode. It
never falls through to deployment.

### Later, separately approved deployment command

Do **not** run this as part of implementation or preparation:

```sh
pnpm contracts:deploy:mainnet
```

If separately authorized later, the command checks the RPC configuration,
compiles the token, reads the payment registry,
connects the external wallet on chain ID 1, confirms the
authorized address, estimates EIP-1559 fees and balance, displays the maximum
gas cost, and requires two exact Shell confirmations before requesting the
wallet's own transaction approval. It sends zero ETH as transaction value and
sets the deployer as the initial holder of the fixed 100,000,000 TINAN supply.

After a returned transaction hash, it records a local Mainnet journal, waits
for 12 confirmations, and verifies deployed runtime bytecode and ERC-20
metadata. The journal is ignored by Git and deployment packaging. If the command
stops after returning a hash, do not delete the journal or retry until wallet
activity and the transaction are checked. A stale lock is intentionally not
removed automatically.

The command does not submit source code to Etherscan. If a future deployment
succeeds, verify the source manually using the compiler settings recorded in the
journal. Until that separate verification is complete, the journal reports it
as pending. Payment checkout remains disabled and requires a separate
administrator configuration and live-wallet acceptance test.

### Deployment output and recovery

The public-data journal is:

```text
lib/tinanai-contracts/deployments/sepolia.json
```

It records the deployer, chain, transaction hashes, addresses and status. A
confirmed file can later supply frontend configuration. No file with real
Sepolia addresses is prepopulated. The example JSON deliberately has null fields.

Deployment is **not atomic**: if Core fails, Token may already exist and the
wallet may already hold its supply. Re-running with the same wallet and journal
reuses saved hashes and Token address rather than blindly deploying again.
Reverted/cancelled transactions stop the script for manual inspection.

**Before retrying, inspect the wallet history and Sepolia Etherscan. Do not delete
the journal to “fix” a pending transaction.** A process can fail between a wallet
submission and saving its hash, so absence of a journal is not proof that no
transaction was sent. Back up a confirmed manifest. Generated journals are
excluded from Git and application publishing by default.

Receipt read-back is not an exact runtime-bytecode comparison or a security
audit. Explorer source verification is a separate step; use the matching
Hardhat build-info/compiler input and settings. Do not claim verification until
the explorer confirms it.

## Frontend integration

The TINANAI website now imports the existing typed ABIs for its read-only
`/contracts` dashboard and shares a wagmi/AppKit wallet connection. No public
TINAN Token/Core deployment exists yet, so no live addresses are preconfigured.
The existing ERC-20 creator, deployment history and EUREKA Mainnet integration
remain separate. This new Core ABI is not the older EUREKA Core ABI.
See `docs/tinanai-web3-integration.md` from the repository root.

The web app's workspace dependency is already installed. For another consumer:

```sh
pnpm --filter @workspace/tinanai add '@workspace/tinanai-contracts@workspace:*'
```

Available exports:

```ts
import {
  tinanAiTokenAbi,
  tinanAiCoreAbi,
  getTinanAiContracts,
  TINANAI_INITIAL_SUPPLY,
  TINANAI_SEPOLIA_CHAIN_ID,
  type TinanAiDeployment,
} from '@workspace/tinanai-contracts';
```

Load the **real confirmed Sepolia manifest** into `deployment`; do not use the
example or local simulation addresses:

```ts
const contracts = getTinanAiContracts(deployment);

// viem public client; no wallet needed for reads.
const supply = await publicClient.readContract({
  address: contracts.token.address,
  abi: contracts.token.abi,
  functionName: 'totalSupply',
});
const linkedToken = await publicClient.readContract({
  address: contracts.core.address,
  abi: contracts.core.abi,
  functionName: 'token',
});
```

For wagmi, the descriptors include `abi`, `address` and `chainId`:

```ts
const result = useReadContract({
  ...contracts.token,
  functionName: 'totalSupply',
});
```

Before integrating writes, confirm the wallet is on Sepolia, read Core's
`owner()`, compare the connected account, hash original document bytes locally,
simulate `registerProof`, and then request an explicit wallet transaction.
After a mined receipt, decode `ProofRegistered` to obtain the proof ID and
read `getProof(id)` back. Never infer success just from a transaction hash.

`getTinanAiContracts` validates configuration shape/chain/addresses; it is **not**
a live deployment attestation or official platform-token authorization.

## Scope and safety

- No existing EUREKA address, ABI or network setting is overwritten.
- No frontend deployment wiring or official-token administrator registry is
  silently installed. Those remain separate, explicit integration work.
- Do not automatically publish the app or submit any public-chain transaction.
- Keep the dependency lockfile and review the contracts before relying on them.
- Contracts and OpenZeppelin dependencies use MIT licenses; preserve their notices.
