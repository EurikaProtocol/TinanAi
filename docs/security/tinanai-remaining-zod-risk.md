# Remaining Zod finding: investigated, not accepted or suppressed

## Status

**BLOCKED:** `GHSA-mrhx-c7xc-m3w5` / `CVE-2023-54404`, HIGH,
`zod@3.25.76`. The scanner describes resource exhaustion while validating
oversized collections and recommends `4.6.6` or later.

The registry's latest stable Zod 3 is still `3.25.76`. No officially patched,
compatible Zod 3 release was found. Application-owned schemas already use
`4.6.7`. There are no audit exclusions or severity downgrades for this finding.

## Dependency paths

- Contract development/build tools: Hardhat `3.21.2` and
  `@nomicfoundation/hardhat-zod-utils@3.0.8` require Zod `^3.23.8`.
  These tools use Zod 3 APIs, including single-argument records, function schemas
  and `error.errors`; forcing Zod 4 into them is not a compatible fix.
- The production dependency graph also contains AppKit → AppKit Pay/Utils →
  Base Account → `@coinbase/cdp-sdk@1.60.0` → Zod `3.25.76`.
  The inspected latest CDP SDK `1.61.0` still requires `^3.25.76`.
  A declared production dependency path does not prove that every affected
  validator executes in the browser, but it prevents a development-only claim.

The second path was missed by an earlier shallow reverse-dependency query.
A visited-node traversal of the complete lockfile dependency graph found it.
The previous development-only classification must not be used as release evidence.

## Remediation options and limits

1. **Compatible upstream patches — preferred, currently unavailable.**
   Recheck both Hardhat and CDP SDK releases. Retest their consumers before
   changing pins. No version is considered patched merely because it installs.
2. **Real runtime/build separation — partial mitigation, not resolution.**
   A production-only pnpm deployment can exclude Hardhat development packages.
   A separate private CI job can run contract tooling with no production
   credentials, only reviewed source and local EVM tests. The CDP SDK path still
   remains, and the development lockfile must stay in complete security scans.
   Merely moving a manifest/lockfile outside scanner coverage is not isolation.
3. **Replace Hardhat — a separate toolchain migration, not a drop-in update.**
   Pinned solc-js plus an EDR or EthereumJS VM harness are possible candidates.
   Registry metadata shows no direct Zod dependency for the inspected EDR
   `0.25.0` or EthereumJS VM `10.1.3`; their complete transitive audits and
   compatibility have not been certified. Migration must preserve all 19 local
   Solidity tests, exact ABI/bytecode/compiler provenance, type generation,
   journals, and externally approved WalletConnect deployment workflows.
   Replacing only the test runner would leave Hardhat deployment/build imports.
4. **Migrate or remove the CDP consumer — separate SDK work.**
   Prefer upstream Zod 4 support. Otherwise inspect and migrate the SDK's policy
   schemas and its Zod-3-constrained ABI dependency, or explicitly approve
   replacing the Base/CDP integration. Do not remove wallet/payment capabilities
   or force major schema changes merely to obtain a clean scanner result.

No toolchain or SDK replacement was applied in this investigation. Existing
dependencies, compiler pins, token source and deployment behavior are preserved.
The HIGH finding remains an unresolved release blocker, not accepted residual risk.

## Application-owned request arrays

The TINANAI API uses Zod 4.6.7 for application-owned schemas. Regression coverage
now confirms that eight user-controlled request arrays reject inputs above their
declared maximums: assistant history, Builder uploads and project files, payment
services, Knowledge collection IDs, and Knowledge chat history. This reduces the
application's exposure to oversized requests at those boundaries; it does not
patch or remove the third-party Zod 3.25.76 dependency, nor prove every downstream
validator is unreachable. Keep the dependency finding open until compatible
upstream releases or a separately reviewed replacement remove the vulnerable
production path.

## Operator-output remediation

The payment-admin CLI no longer prints raw owner IDs or spreads arbitrary state
into stdout. It prints explicit status booleans and a domain/environment-bound
SHA-256 owner confirmation reference. The reference is pseudonymous, not anonymous
and not a grant credential; keep operator output private.

The legacy confirmation-by-user-ID option is retained for independently verified
IDs. Mutations still require explicit matching confirmation. Third-party errors
cannot pass through by matching a familiar prefix: only exact approved messages
are printed. The existing email command-line argument should only be used in a
trusted operator environment because shell history/process listings can retain it.

No production owner operation, role change, publication, production restart,
public-chain transaction, contract deployment or checkout activation is part of
this remediation.
