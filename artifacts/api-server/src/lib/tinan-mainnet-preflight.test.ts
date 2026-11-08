import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, type PublicClient } from "viem";
import { readOnlyMainnetPreflight, validDeployer, deploymentRecords } from "./tinan-mainnet-preflight";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validCatalogEndpoint, tokenSourceStatus } from "./tinan-mainnet-policy";
import { tokenArtifact } from "@workspace/tinanai-contracts/token-artifact";

const approved = getAddress("0x1111111111111111111111111111111111111111");
const config = { approvedDeployer: approved, revision: null, rpcConfigured: true, cliDeployerConfigured: true, cliDeployerMatches: true, catalogUrlConfigured: true };
const wallet = { connectedAddress: approved, walletChainId: 1, connectorType: "walletConnect" };
const records = { checked: true, addresses: [] as string[], blockers: [] as string[] };
const payment = { enabled: false, chainId: 11155111, tokenAddress: null, confirmations: 12 };
const env = { TINANAI_MAINNET_RPC_URL: "https://rpc.example.test/private-credential", TINANAI_MAINNET_PAYMENT_CATALOG_URL: "https://app.example.test/api/tinanai/payments/catalog" };
test("confirmed journals permit verification of existing tokens but uncertain statuses always require reconciliation", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mainnet-journal-test-"));
  try {
    for (const status of ["submitted", "pending", "reverted", undefined, "confirmed"]) {
      writeFileSync(path.join(directory, "mainnet.json"), JSON.stringify({ chainId: 1, status, tokenAddress: approved }));
      const result = deploymentRecords(directory);
      assert.equal(result.checked, true);
      assert.deepEqual(result.addresses, [approved]);
      assert.equal(result.blockers.length > 0, status !== "confirmed");
    }
    writeFileSync(path.join(directory, "mainnet.json.tmp"), "{}");
    assert.ok(deploymentRecords(directory).blockers.some(message => message.includes("temporary")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
function fake(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => 1,
    getBalance: async () => 10n ** 18n,
    estimateGas: async () => 500_000n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n }),
    getBlock: async () => ({ baseFeePerGas: 10_000_000_000n }),
    ...overrides,
  } as unknown as PublicClient;
}
test("legacy read-only helper never executes creation-code simulation or returns a gas quote", async () => {
  let estimated = false;
  const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake({
    estimateGas: async () => { estimated = true; throw new Error("Forbidden simulation"); },
  }));
  assert.equal(report.ready, false);
  assert.equal(report.chainId, 1);
  assert.equal(report.estimatedGas, null);
  assert.equal(report.gasLimit, null);
  assert.equal(report.estimatedCostEth, null);
  assert.equal(report.maximumCostEth, null);
  assert.equal(estimated, false);
  assert.equal(report.checks.find(check => check.id === "gas")?.status, "BLOCKED");
  assert.ok(!JSON.stringify(report).includes("private-credential"));
});
test("missing configuration reports blockers without creating defaults or touching RPC", async () => {
  const report = await readOnlyMainnetPreflight({ ...config, approvedDeployer: null, cliDeployerConfigured: false, catalogUrlConfigured: false }, { connectedAddress: null, walletChainId: null, connectorType: null }, undefined, records, {}, () => { throw new Error("must not call"); });
  assert.equal(report.ready, false);
  assert.equal(report.chainId, null);
  assert.equal(report.paymentCheckoutDisabled, false);
  assert.ok(report.blockers.some(reason => reason.includes("RPC_URL")));
});
test("wrong RPC chain stops before balance or gas", async () => {
  const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake({
    getChainId: async () => 11155111,
    getBalance: async () => { throw new Error("must not read"); },
  }));
  assert.equal(report.chainId, 11155111);
  assert.equal(report.balanceEth, null);
  assert.equal(report.estimatedGas, null);
  assert.equal(report.ready, false);
});
test("wallet mismatch blocks readiness and never authorizes gas simulation", async () => {
  for (const patch of [{ connectedAddress: "0x2222222222222222222222222222222222222222" }, { walletChainId: 11155111 }, { connectorType: "injected" }]) {
    const report = await readOnlyMainnetPreflight(config, { ...wallet, ...patch }, payment, records, env, () => fake());
    assert.equal(report.ready, false);
    assert.equal(report.estimatedGas, null);
    assert.ok(report.checks.some(check => check.mandatory && check.status !== "PASS"));
  }
});
test("balance alone cannot establish sufficient deployment funds without an authorized quote", async () => {
  const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake({ getBalance: async () => 1n }));
  assert.equal(report.maximumCostEth, null);
  assert.equal(report.ready, false);
  assert.equal(report.checks.find(check => check.id === "funds")?.status, "BLOCKED");
});
test("known Mainnet address, uncertain records, CLI mismatch and enabled checkout block readiness", async () => {
  const report = await readOnlyMainnetPreflight({ ...config, cliDeployerMatches: false }, wallet,
    { enabled: true, chainId: 1, tokenAddress: approved },
    { checked: false, addresses: [], blockers: ["An uncertain journal requires review."] }, env, () => fake());
  assert.equal(report.ready, false);
  assert.deepEqual(report.existingAddresses, [approved]);
  assert.equal(report.paymentCheckoutDisabled, false);
  assert.ok(report.blockers.some(reason => reason.includes("does not match")));
});
test("RPC failures never return provider credential-bearing errors", async () => {
  for (const overrides of [
    { getChainId: async () => { throw new Error(env.TINANAI_MAINNET_RPC_URL); } },
    { estimateGas: async () => { throw new Error(env.TINANAI_MAINNET_RPC_URL); } },
  ]) {
    const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake(overrides));
    assert.equal(report.ready, false);
    assert.ok(!JSON.stringify(report).includes("private-credential"));
  }
});
test("approval rejects malformed and zero Ethereum addresses", () => {
  assert.equal(validDeployer("0x0000000000000000000000000000000000000000"), null);
  assert.equal(validDeployer("not an address"), null);
  assert.equal(validDeployer(approved), approved);
});
test("catalog validation rejects arbitrary strings, insecure URLs, credentials and wrong paths without echoing values", () => {
  for (const value of [undefined, "provider-credential", "http://example.test/api/tinanai/payments/catalog",
    "https://user:secret@example.test/api/tinanai/payments/catalog", "https://example.test/wrong",
    "https://example.test/api/tinanai/payments/catalog?secret=hidden"]) assert.equal(validCatalogEndpoint(value), false);
  assert.equal(validCatalogEndpoint(env.TINANAI_MAINNET_PAYMENT_CATALOG_URL), true);
});
test("build provenance alone cannot satisfy production readiness without a deployed token and payment configuration", async () => {
  assert.equal(tokenSourceStatus().status, "PASS");
  const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake());
  assert.equal(report.ready, false);
  assert.ok(report.checks.some(check => check.mandatory && check.status !== "PASS"));
  assert.equal(report.tokenVerified, null);
  assert.equal(report.paymentConfigured, false);
  assert.equal(report.checkoutEnabled, false);
  assert.equal(report.checks.find(check => check.id === "ownership")?.status, "NOT_TESTED");
  const invalid = await readOnlyMainnetPreflight(config, wallet, { ...payment, confirmations: 2 }, records, env, () => fake());
  assert.equal(invalid.ready, false);
  assert.equal(invalid.checks.find(check => check.id === "confirmations")?.status, "BLOCKED");
});
const configuredPayment = { enabled: false, chainId: 1, tokenAddress: approved, treasuryAddress: "0x2222222222222222222222222222222222222222", tinanPerEur: "100", rateSource: "Administrator-reviewed test rate", confirmations: 12 };
function tokenClient(overrides: Record<string, unknown> = {}) {
  return fake({
    getBlockNumber: async () => 1000n,
    getBytecode: async () => tokenArtifact.deployedBytecode,
    readContract: async ({ functionName }: { functionName: string }) => ({ name: "TinanAi", symbol: "TINAN", decimals: 18, totalSupply: 100_000_000n * 10n ** 18n })[functionName],
    ...overrides,
  });
}
test("legacy payment readiness does not authorize a new-token simulation even with a verified existing token", async () => {
  const report = await readOnlyMainnetPreflight(config, wallet, configuredPayment, records, env, () => tokenClient());
  assert.equal(report.ready, false);
  assert.equal(report.tokenVerified, true);
  assert.equal(report.paymentConfigured, true);
  assert.equal(report.checkoutEnabled, false);
  assert.equal(report.checks.find(c => c.id === "existingToken")?.status, "BLOCKED"); // New deployment still prohibited.
  assert.ok(report.checks.find(c => c.id === "onchainToken")?.detail.includes("block 989"));
});
test("missing recipient, rate and Mainnet payment settings each prevent production readiness", async () => {
  for (const patch of [{ treasuryAddress: null }, { treasuryAddress: approved }, { tinanPerEur: null }, { rateSource: "" }, { chainId: 11155111 }, { tokenAddress: null }]) {
    const report = await readOnlyMainnetPreflight(config, wallet, { ...configuredPayment, ...patch }, records, env, () => tokenClient());
    assert.equal(report.ready, false);
    assert.equal(report.paymentConfigured, false);
  }
});
test("wrong deployed bytecode or metadata is mandatory failure, not unknown or success", async () => {
  for (const patch of [
    { getBytecode: async () => "0x1234" },
    { readContract: async () => "EURIKA" },
    { getBytecode: async () => undefined },
  ]) {
    const report = await readOnlyMainnetPreflight(config, wallet, configuredPayment, records, env, () => tokenClient(patch));
    assert.equal(report.ready, false);
    assert.equal(report.tokenVerified, false);
    assert.equal(report.checks.find(c => c.id === "onchainToken")?.status, "FAIL");
  }
});
test("a failed RPC retains a complete checklist rather than hiding unperformed checks", async () => {
  const report = await readOnlyMainnetPreflight(config, wallet, payment, records, env, () => fake({ getChainId: async () => { throw new Error("secret"); } }));
  for (const id of ["rpc", "network", "balance", "gas", "funds", "source", "wallet", "journals"]) {
    assert.ok(report.checks.find(check => check.id === id));
  }
  assert.equal(report.checks.find(check => check.id === "gas")?.status, "BLOCKED");
  assert.ok(!JSON.stringify(report).includes("secret"));
});
