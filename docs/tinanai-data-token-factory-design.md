# Data-token factory design — not deployed or approved

## Status and boundaries

TINAN's existing fixed 100M ERC-20 and TinanAiCore are unchanged. Core is an
owner-managed proof registry, **not** a token factory. The user confirmed that
this TINAN Token/Core suite has no public deployment yet. EURIKA/EUREKA ecosystem
configuration and its separate Mainnet proof registry are not substitutes for
these contracts.

The new website studio saves proposed projects and presents a deployment design
review. It has no factory address, deployment calldata, signer action, gas estimate
or live deployment button. Creating a project does not mint tokens, register a
proof, charge a fee or enforce usage rights.

## Proposed contracts — subject to explicit review before implementation

1. **DataTokenFactory**: non-upgradeable, separate from TINAN/Core, uses typed
   ERC-20/ERC-1155 creation entry points rather than accepting arbitrary bytecode.
   A deterministic configuration hash includes chain, creator, standard, metadata,
   supply, rights-policy hash and reward settings; creator-scoped nonces prevent
   accidental collisions. Emit `DataTokenCreated(creator, token, standard,
   configHash)` only after successful initialization. No implicit token approvals,
   deposits, factory fees, token transfers or TINAN holder privileges.
2. **FixedSupplyDataERC20**: reviewed OpenZeppelin ERC-20 template with
   configurable name/symbol/decimals (proposed 0–18), one-time positive initial
   supply minted to the explicitly reviewed creator address. Supply/base-unit
   overflow checks. No future mint, hidden tax, privileged transfer, proxy or
   confiscation. Metadata/usage policy reference immutable at creation unless
   separately reviewed governance is introduced.
3. **DataEditionERC1155**: reviewed ERC-1155 template for integer editions,
   decimals fixed at zero, immutable supply per created edition. Creator owns
   only explicitly documented issuance capabilities; no undisclosed factory
   administrator privilege. Proposed EIP-2981 royalty recipient and basis points
   affect royalty information, not enforce marketplace payments.
4. **RewardVault**, only if separately approved: opt-in, explicitly funded reward
   distribution with pull-based claims, replay protection and reentrancy guards.
   A reward percentage in a draft does not create funds or entitle the factory to
   move user assets. Reward asset, funding, allocation, claim proofs, settlement
   period and withdrawal authority must be decided before implementation.

## Permissions and data-access rules

- Creator: approves an exact transaction and receives the initial token/editions.
  No approval is delegated merely by connecting a wallet.
- Factory administrator: preferably no token-management privileges. If emergency
  factory pausing is approved, it may block **new creation only**, never freeze or
  seize existing token balances. Any administrator/multisig must be documented.
- Holders: ordinary standard transfers; holding a token does not itself deliver
  confidential files or grant legal rights beyond the referenced terms.
- Access provider: public, holder-gated or allowlisted access is an application/
  storage authorization problem requiring independent authenticated enforcement.
  Onchain policy hashes are evidence of declared rules, not encrypted storage.
- Royalties: proposed EIP-2981 is advisory; ERC-20 transfers do not inherently
  support secondary-sale royalty enforcement. UI rules must not promise this.
- Usage terms: hash/version and URI must be reviewed before publishing. No private
  dataset bytes, PII or credentials belong in public metadata.
- Existing TinanAiCore owner is not automatically the data-factory administrator.

## Required tests before any deployment proposal

Contract tests must cover creation for both standards; name/symbol/decimals/base
units; zero recipient; overflow; one-time initialization; final fixed supply;
events/configuration hash; replay/nonces; invalid metadata; owner/creator access;
no post-creation administrator mint/seizure; role transfer and any approved pause
scope; standard ERC-20/ERC-1155 behavior; royalties bounds; reward-vault funding,
claims/replay/reentrancy and conservation of funds if that vault is approved.

Integration tests must verify chain and bytecode, template provenance, linked
addresses, creator and exact arguments; simulate the actual factory call using
the connected account; estimate gas from RPC; present chain, destination, calldata,
amount, recipients, fees and permission changes; require explicit user review and
wallet confirmation; wait for receipt plus creation event and token read-back.
Reject account/network changes between simulation and confirmation. No automatic
allowances, message signatures or transactions. Cancel/rejection/replacement/
pending/revert and reconnect/mobile cases need coverage.

**Already implemented/tested now:** offchain schema validation, uint256 bounds,
ERC-1155 decimals, rights/recipient validation, browser persistence isolation,
and a hard blocked deployment-review object with no transaction payload.
These are not substitutes for the future Solidity tests above.

## Approval gates

1. Agree on standard-specific issuance, rights, metadata, royalty limitations,
   reward funding and administrator permissions.
2. Implement new source templates and all permission/contract tests separately
   from the existing TINAN suite; review dependencies and security.
3. Obtain explicit approval for a named testnet deployment, its precise source,
   account, chain and cost. Only then may a user submit transactions.
4. Verify code and receipts, configure real factory addresses, then enable
   simulation and wallet confirmation. Mainnet requires a separate approval.

No contracts were deployed, no ETH was spent and no chain transactions were
submitted for this integration.
