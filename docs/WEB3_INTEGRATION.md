# Web3 Integration Status

## Asset identity

EURIKA and TINAN are separate assets and must remain separate in configuration, UI claims and contract workflows. Existing EURIKA/EUREKA ecosystem contracts and liquidity references are not replaced by TINAN.

Historical Mainnet contracts reporting the TINAN symbol are not proof that the new fixed-supply TinanAiToken was deployed. Reconcile known addresses and deployment evidence before making an absence or official-token claim.

## Current behavior

- Wallet connection and account/network observation are distinct from signing.
- The Launchpad's token deployment flow is limited to Sepolia and requires explicit wallet confirmation.
- Mainnet preparation is read-only. It does not sign, simulate deployment by default, broadcast, or enable checkout.
- Contract source, local Hardhat tests and exported bytecode are review inputs—not proof of deployment, independent verification, or a security audit.
- Proof registration is a separately reviewed, wallet-confirmed action. No token approval/transfer is part of proof registration.
- Data-tokenization flows are proposals; no factory deployment is represented as available.
- The EURIKA dashboard is explorer-data-only when the explorer reports metadata without verified source/ABI. Owner/admin and supported functions remain unknown unless an independent source verifies them.
- At the audit snapshot, Blockscout metadata and transaction history responded; raw logs and Sourcify verification metadata did not. The UI reports this limited evidence rather than treating it as verified source.
- Payment transfers require a separately configured verified token, recipient, policy, user review and wallet confirmation. Live checkout is not activated.

## Safety rules

Never request or store private keys. Never automatically sign or broadcast. Do not run mainnet transactions, spend funds, replace contracts, migrate liquidity, or activate checkout without separate explicit approval and verified configuration.

For detailed implementation notes, see `docs/tinanai-web3-integration.md`, `docs/tinanai-mainnet-readiness-audit.md`, and `docs/tinanai-data-token-factory-design.md`.

