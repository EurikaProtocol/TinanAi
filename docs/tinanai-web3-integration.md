# TINANAI wallet and contract website integration

## What changed

- The website header has one shared wagmi/viem wallet connection, reused by the
  existing Sepolia-only Launchpad hook. Browser wallets, EIP-6963 discovery,
  Reown AppKit wallet selection and WalletConnect mobile/QR connection are
  supported. Wallet connection is separate from Clerk account authentication.
- The wallet menu displays the connected address, current chain, live native
  ETH balance (or unavailable), explicit Ethereum/Sepolia switching and
  disconnect. It never requests a message signature, token allowance or transfer.
- `/contracts` is a new read-only Token/Core dashboard. The existing ERC-20
  creator remains at `/launchpad/contracts`.
- `/data-tokenization` is a separate browser-local data-project studio, not a
  deployment factory. The original `/tokenize` planning flow remains intact.
- Main navigation and mobile “More” include both new pages.
- Existing TINAN Solidity contracts, their fixed supply, deployment scripts and
  EURIKA/EUREKA contract configuration were not changed. The document proof
  controller only received a TypeScript provider-boundary adjustment to avoid
  conflicting SDK declarations; its addresses and transaction behavior remain
  unchanged.

## No public TINAN deployment yet

The user confirmed that this TinanAiToken/TinanAiCore suite is **not deployed**.
No Ethereum/Sepolia manifest or contract address was invented, and no public
transaction was sent. The dashboard starts unconfigured with no token metrics.
The 100M supply in the Solidity source is an expected validation value, not
displayed as an actual live supply without a successful contract read.

Once real deployments exist, the dashboard can observe addresses entered for
Ethereum or Sepolia. These settings are personal to the browser and are **not**
official platform-token registration or administrator approval.

Read-back checks include:

1. Supported selected chain and syntactically valid, nonzero, distinct addresses.
2. RPC chain ID matching that selection.
3. Nonempty Token and Core bytecode.
4. ABI decoding of token name, symbol, decimals and actual total supply.
5. Name `TinanAi`, symbol `TINAN`, 18 decimals and exact expected 100M supply.
6. Core's token link matching the selected Token address, plus actual owner and
   proof count. A connected wallet adds `balanceOf` without requiring a signer.

All snapshot reads use one block number and show the check time. Failures do not
turn into fake zero balances or successful status. Account/config/network changes
use separate query keys; snapshots refresh every 30 seconds. Matching code
presence and settings is **not** exact runtime bytecode/source verification,
official endorsement or a security audit.

Activity is limited to decoded Token Transfer and Core ProofRegistered events
from the latest **500 blocks**. With a wallet connected it is filtered by that
account; without one it observes the contracts. Partial/unsupported RPC history
is labelled. This is not an exhaustive wallet-history indexer. Explorer links
use the selected network. Activity refreshes every 60 seconds.

## Wallet configuration

The existing public `VITE_REOWN_PROJECT_ID` enables AppKit/WalletConnect. No new
wallet key or recovery phrase is used. Without that project ID, browser wallet
connection remains available and the mobile action explains why it is disabled.
Metadata uses the actual browser origin rather than a guessed production URL.

Reown project origin restrictions, RPC availability, wallet compatibility and a
real mobile-device session remain external prerequisites. Connecting a wallet
requests account/session access only; network switching requires a separate user
click. No network is silently switched by opening a dashboard.

Wagmi **2.x** is intentionally used with stable AppKit **1.8.x**. AppKit's optional
connector range can otherwise resolve to a wagmi-3-only major. The narrowly scoped
pnpm override keeps the adapter's `@wagmi/connectors` on compatible **6.2.0**.
Do not remove it or jump to wagmi 3 without checking the matching AppKit release
and wallet tests.

The shared wallet does not expand the existing Launchpad's Sepolia-only
deployment permissions. Existing user-triggered deployment/proof features are
not run by this integration or its public-chain tests. AppKit email/social,
analytics, swap, on-ramp and send features are disabled.

Wallet SDK session data uses normal browser persistence; it is not a server-held
wallet key. The separate Hardhat CLI deployer still uses its own memory-only
session. Never publish WalletConnect pairing QR codes or URIs.

## Data projects

The studio supports create, edit, delete with confirmation, browser persistence,
JSON export, live preview and an offchain deployment-design review:

- ERC-20/1155 proposal; name, symbol, description, public metadata URI.
- Positive supply and configurable decimals; ERC-1155 requires zero decimals.
- Public, token-holder or allowlist access; declared usage rights/custom terms.
- Proposed royalty/reward basis points and recipient addresses.
- Field validation, uint256 base-unit bounds and clear save/storage errors.

Projects are separated by connected wallet address, with a distinct disconnected
guest scope. Switching account resets the editor/review and selects that account's
records. This is browser organization, **not authenticated private storage**:
anyone using the browser can access its storage; it is not synced across devices.
Invalid saved records are not silently overwritten.

**Deployment is deliberately unavailable.** The review returns `canDeploy: false`
and no factory address, calldata or gas estimate. No nonexistent transaction is
simulated. No signing or submission callback is wired to the disabled action.
TinanAiCore only registers proofs, and none of the proposed rights, royalties or
rewards are currently enforced.

See [the factory design and permission/test plan](tinanai-data-token-factory-design.md)
before implementing any factory. Actual factory implementation, Solidity tests,
audit/review, explicit deployment approval, confirmed addresses, live simulation,
gas estimation and final wallet confirmation remain pending.

## Checks and honest limits

Run:

```sh
pnpm --filter @workspace/tinanai run test
pnpm --filter @workspace/tinanai-contracts run test
pnpm run typecheck:libs
pnpm -r --workspace-concurrency=1 --filter './artifacts/**' --filter './scripts' --if-present run typecheck
pnpm --filter @workspace/tinanai-contracts run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/mockup-sandbox run build
PORT=22751 BASE_PATH=/eurika-dashboard/ pnpm --filter @workspace/eurika-dashboard run build
pnpm --filter @workspace/tinanai run build
```

Build each artifact with its own manifest environment. In particular, the
existing EURIKA dashboard's shell build requires its declared port and base path;
a bare recursive build without that environment stops there. Do not change its
path to the TINANAI root just to make the command pass.

Run heavy checks separately from browser recording to limit peak memory.
Unit tests preserve the existing web suite and add read-only mocked-RPC
ABI decoding, network/address validation, mismatch handling, bounded history,
wallet error/chain guards and data-project validation/persistence/isolation.
The unchanged Hardhat suite tests only a local simulated EVM, not public chains.

Browser tests use a fake injected provider and prohibit signing/submission
methods. Mobile layout/QR UI testing is not a real-device wallet pairing.
Neither mocked RPC tests nor UI tests establish a live TINAN deployment.

### Results for this integration

- Website regression/unit suite: **68 passed**, including the new reader,
  validation and closed-modal retry guards.
- Unchanged Hardhat local-EVM suite: **9 passed**.
- Shared libraries, all artifacts and workspace scripts typechecked; the changed
  website was checked again after the wallet retry adjustment.
- All workspace production builds passed, using each artifact's own port/base
  path where required.
- Browser-confirmed: public unconfigured dashboard, fake injected connection and
  address display, visible Ethereum/Sepolia UI round-trip, data-project
  create/edit/reload persistence, account-switch isolation, blocked design review,
  deletion, mobile-width layout with no page overflow and reachable disconnect.
- Native balance is read through the configured public client, not necessarily
  the injected provider; a synthetic test address can itself have real
  public-chain funds. A fake provider returning zero is not an oracle for the
  public RPC's balance. A separate mocked-zero balance browser assertion was not
  completed, and is not claimed as passed.
- Final mobile-width wallet recheck passed: the standard AppKit picker opened,
  selecting WalletConnect produced a real QR, closing it restored an enabled
  Connect Wallet control, and the guarded fake browser wallet reconnected.
  Captured provider requests included both Ethereum and Sepolia
  `wallet_switchEthereumChain` calls; the UI round-trip and return `chainChanged`
  event were confirmed. No send/sign/approval/deployment calls occurred. Active
  QR screenshots and pairing URIs were not retained or shared.
- **Still pending:** real-device wallet pairing; live Token/Core reads after
  actual deployment and address configuration; any separate approved factory
  implementation, contract tests, simulation and deployment.

Earlier verification interruptions coincided with leftover browser-recording processes retaining
multiple gigabytes of shared memory. Only the temporary test recordings were
stopped; no user recordings or application data were removed. No signing,
approval, public transaction or contract deployment was attempted in the browser.
