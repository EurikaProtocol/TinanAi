import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseMainnetRpc, type MainnetDiagnosticClient } from "./tinan-mainnet-diagnostics.ts";

const address = "0x1111111111111111111111111111111111111111";
const secretUrl = "https://rpc.example.test/private-key?apiKey=must-not-leak";
function fixture() {
  const calls: unknown[] = [];
  const client: MainnetDiagnosticClient = {
    async getChainId() { calls.push("eth_chainId"); return 1; },
    async getBlock() { calls.push("eth_getBlockByNumber"); return { number: 123n, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000n }; },
    async getBalance(input) { calls.push(["eth_getBalance", input]); return 10n ** 18n; },
    async getTransactionCount(input) { calls.push(["eth_getTransactionCount", input]); return input.blockTag === "pending" ? 5 : 4; },
  };
  return { calls, client };
}
test("RPC diagnostics use only read methods and pin confirmed account state to one block", async () => {
  const f = fixture();
  const result = await diagnoseMainnetRpc(secretUrl, address, () => f.client);
  assert.equal(result.status, "PASS"); assert.equal(result.chainId, 1);
  assert.equal(result.blockNumber, "123"); assert.equal(result.balanceEth, "1");
  assert.equal(result.nonce, "4"); assert.equal(result.pendingNonce, "5");
  assert.equal(result.blockTime, "2023-11-14T22:13:20.000Z");
  assert.deepEqual(f.calls, [
    "eth_chainId", "eth_getBlockByNumber",
    ["eth_getBalance", { address, blockNumber: 123n }],
    ["eth_getTransactionCount", { address, blockNumber: 123n }],
    ["eth_getTransactionCount", { address, blockTag: "pending" }],
  ]);
  assert.ok(!JSON.stringify(result).includes("private-key"));
  assert.ok(!JSON.stringify(result).includes("rpc.example"));
});
test("missing/invalid RPC or deployer is blocked before any client is created", async () => {
  for (const [rpc, deployer] of [
    [undefined, address], ["http://rpc.example", address], ["https://user:pass@rpc.example", address],
    [secretUrl, null], [secretUrl, "bad"], [secretUrl, "0x0000000000000000000000000000000000000000"],
  ] as const) {
    const result = await diagnoseMainnetRpc(rpc, deployer, () => { throw new Error("Client must not be created"); });
    assert.equal(result.status, "BLOCKED");
  }
});
test("wrong network stops before block, account, fee or simulation reads", async () => {
  const f = fixture(); f.client.getChainId = async () => 11155111;
  const result = await diagnoseMainnetRpc(secretUrl, address, () => f.client);
  assert.equal(result.status, "FAIL"); assert.deepEqual(f.calls, []);
  assert.equal(result.balanceEth, null);
});
test("provider errors never expose URL, credentials, raw errors or partial account snapshots", async () => {
  const f = fixture(); f.client.getBalance = async () => { throw new Error(secretUrl); };
  const result = await diagnoseMainnetRpc(secretUrl, address, () => f.client);
  assert.equal(result.status, "FAIL");
  assert.equal(result.balanceEth, null); assert.equal(result.blockNumber, null);
  assert.ok(!JSON.stringify(result).includes(secretUrl));
  assert.ok(!JSON.stringify(result).includes("must-not-leak"));
});
test("malformed block or regressed pending nonce fails closed", async () => {
  const f = fixture(); f.client.getBlock = async () => ({ number: null, hash: null, timestamp: 1n });
  assert.equal((await diagnoseMainnetRpc(secretUrl, address, () => f.client)).status, "FAIL");
  const g = fixture(); g.client.getTransactionCount = async input => input.blockTag === "pending" ? 2 : 4;
  assert.equal((await diagnoseMainnetRpc(secretUrl, address, () => g.client)).status, "FAIL");
});
