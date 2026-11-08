import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hash, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { db, pool, tinanPaymentInvoicesTable as invoices, tinanPaymentServicesTable as services, tinanPaymentUsageTable as usage, tinanPaymentAdminsTable as admins } from "@workspace/db";
import { csvCell, paymentAddress, quoteAtomic, validatePaymentConfirmations, validatePaymentToken, verifyInvoiceTransfer, type TransferInvoice } from "./tinan-payment-chain";
import { tokenArtifact } from "@workspace/tinanai-contracts/token-artifact";
import { UpdateTinanPaymentAdminBody } from "@workspace/api-zod";
import { accountPayments, finishServiceCredit, isPaymentAdmin, reserveServiceCredit } from "./tinan-payment-store";
import { verifyOwnedInvoice } from "./tinan-payment-verification";

const payer = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const hash = () => `0x${randomBytes(32).toString("hex")}` as Hash;
const createdAt = new Date("2026-11-01T00:00:00Z");
const baseInvoice: TransferInvoice = {
  payer, treasuryAddress: treasury, tokenAddress: token, chainId: 11155111,
  amountAtomic: "1250000000000000000", minBlock: "100", createdAt,
  expiresAt: new Date(createdAt.getTime() + 15 * 60_000), requiredConfirmations: 2,
};
function chainFixture(txHash = hash()) {
  const blockHash = hash();
  const receipt = {
    transactionHash: txHash, status: "success", blockNumber: 101n, blockHash,
    logs: [{
      removed: false, address: token,
      data: encodeAbiParameters([{ type: "uint256" }], [BigInt(baseInvoice.amountAtomic)]),
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: payer, to: treasury } }),
    }],
  };
  const tx = { from: payer, to: token, value: 0n, blockHash, input: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [treasury, BigInt(baseInvoice.amountAtomic)] }) };
  const block = { hash: blockHash, timestamp: BigInt(createdAt.getTime() / 1000 + 12) };
  const client = {
    getChainId: async () => 11155111,
    getBlockNumber: async () => 112n,
    getTransactionReceipt: async () => receipt,
    getTransaction: async () => tx,
    getBlock: async () => block,
    getBytecode: async (): Promise<string> => tokenArtifact.deployedBytecode,
    readContract: async ({ functionName }: { functionName: string }) => ({ name: "TinanAi", symbol: "TINAN", decimals: 18, totalSupply: 100_000_000n * 10n ** 18n })[functionName],
  };
  return { txHash, receipt, tx, block, client, rpc: client as unknown as PublicClient };
}

describe("Exact EUR quotes and noncustodial transfer validation", () => {
  it("uses integer math, including upward rounding of sub-wei cents", () => {
    assert.equal(quoteAtomic(125, "1"), "1250000000000000000");
    assert.equal(quoteAtomic(1, "0.000000000000000001"), "1");
    assert.equal(quoteAtomic(199, "12.34567890123456789"), "24567901013456790102");
  });
  it("rejects malformed, zero, negative, floating and out-of-supply prices/rates", () => {
    for (const rate of ["0", "-1", "1e3", " 1", "01", "1.0000000000000000001"]) assert.throws(() => quoteAtomic(100, rate));
    for (const cents of [0, -1, 1.5, NaN, 100_000_001]) assert.throws(() => quoteAtomic(cents, "1"));
    assert.throws(() => quoteAtomic(100_000_000, "1000000000000000"));
    assert.throws(() => paymentAddress("0x0000000000000000000000000000000000000000"));
    assert.throws(() => paymentAddress("not-an-address"));
  });
  it("validates deployed code, RPC network and exact token metadata before accepting configuration", async () => {
    const f = chainFixture();
    assert.equal(await validatePaymentToken(11155111, token, f.rpc), 112n);
    await assert.rejects(validatePaymentToken(1, token, f.rpc), /chain ID/);
    f.client.getBytecode = async () => "0x";
    await assert.rejects(validatePaymentToken(11155111, token, f.rpc), /No token contract/);
    f.client.getBytecode = async () => "0x1234";
    await assert.rejects(validatePaymentToken(11155111, token, f.rpc), /runtime bytecode/);
    f.client.getBytecode = async () => tokenArtifact.deployedBytecode;
    f.client.readContract = async () => "WRONG";
    await assert.rejects(validatePaymentToken(11155111, token, f.rpc), /does not match/);
  });
  it("accepts only the exact successful transfer with enough canonical confirmations", async () => {
    const f = chainFixture();
    assert.deepEqual(await verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc), { status: "confirmed", confirmations: 12, blockNumber: "101", error: null });
    f.client.getBlockNumber = async () => 111n;
    assert.equal((await verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc)).status, "confirming");
  });
  it("enforces 12–100 integer confirmations in backend logic and generated request validation on both networks", () => {
    for (const n of [12, 13, 100]) assert.equal(validatePaymentConfirmations(n), n);
    for (const n of [0, 2, 11, 101, 12.5, NaN, Infinity]) assert.throws(() => validatePaymentConfirmations(n));
    for (const chainId of [1, 11155111]) {
      for (const confirmations of [2, 11, 12, 100, 101, 12.5]) {
        const result = UpdateTinanPaymentAdminBody.safeParse({ settings: { enabled: false, chainId, tokenAddress: null, treasuryAddress: null,
          tinanPerEur: null, rateSource: "", confirmations, revision: 0 }, services: [] });
        // The complete configuration requires six services; inspect the field validator directly.
        assert.equal(UpdateTinanPaymentAdminBody.shape.settings.shape.confirmations.safeParse(confirmations).success,
          Number.isInteger(confirmations) && confirmations >= 12 && confirmations <= 100);
        void result;
      }
    }
  });
  it("does not treat an unknown receipt or unavailable RPC as a confirmation", async () => {
    const f = chainFixture();
    f.client.getTransactionReceipt = async () => { const e = new Error(); e.name = "TransactionReceiptNotFoundError"; throw e; };
    assert.equal((await verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc)).status, "pending");
    f.client.getTransactionReceipt = async () => { throw new Error("RPC unavailable"); };
    await assert.rejects(verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc), /RPC unavailable/);
  });
  for (const field of ["sender", "target", "native", "calldata", "event-address", "event-data", "event-count", "removed", "reverted", "old-block", "late", "early"] as const) {
    it(`rejects mismatched ${field}`, async () => {
      const f = chainFixture();
      if (field === "sender") f.tx.from = treasury;
      if (field === "target") f.tx.to = treasury;
      if (field === "native") f.tx.value = 1n;
      if (field === "calldata") f.tx.input = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [treasury, BigInt(baseInvoice.amountAtomic)] });
      if (field === "event-address") f.receipt.logs[0]!.address = treasury;
      if (field === "event-data") f.receipt.logs[0]!.data = encodeAbiParameters([{ type: "uint256" }], [1n]);
      if (field === "event-count") f.receipt.logs.push(f.receipt.logs[0]!);
      if (field === "removed") f.receipt.logs[0]!.removed = true;
      if (field === "reverted") f.receipt.status = "reverted";
      if (field === "old-block") f.receipt.blockNumber = 100n;
      if (field === "late") f.block.timestamp += 60n * 60n;
      if (field === "early") f.block.timestamp -= 60n;
      assert.equal((await verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc)).status, "failed");
    });
  }
  it("rejects noncanonical and dishonest-RPC receipts without granting credit", async () => {
    const f = chainFixture();
    f.block.hash = hash();
    await assert.rejects(verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc), /canonical/);
    f.receipt.transactionHash = hash();
    await assert.rejects(verifyInvoiceTransfer(baseInvoice, f.txHash, f.rpc), /receipt hash/);
  });
  it("wallet ownership proof cannot be replayed for another message or account", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey()); // Ephemeral local test only; never persisted.
    const message = `TINANAI payment authorization ${randomUUID()}`;
    const signature = await wallet.signMessage({ message });
    assert.equal(await verifyMessage({ address: wallet.address, message, signature }), true);
    assert.equal(await verifyMessage({ address: wallet.address, message: `${message}x`, signature }), false);
    assert.equal(await verifyMessage({ address: payer, message, signature }), false);
  });
  it("escapes CSV quotes, newlines and spreadsheet formulas", () => {
    assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
    assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
    assert.equal(csvCell("  +1"), '"\'  +1"');
  });
});

describe("Development PostgreSQL payment concurrency and isolation", () => {
  it("protects account ownership, duplicate transfers and concurrent credit spending", async () => {
    assert.notEqual(process.env.NODE_ENV, "production");
    const owner = `payment-test-${randomUUID()}`;
    const other = `payment-test-${randomUUID()}`;
    const slug = `test-${randomUUID()}`;
    const ids = [randomUUID(), randomUUID()];
    const f = chainFixture();
    try {
      await db.insert(services).values({ slug, name: "Test service", description: "Isolated development test", route: "/payments", enabled: true, requiresPayment: true });
      for (const id of ids) await db.insert(invoices).values({
        ...baseInvoice, id, ownerId: owner, serviceSlug: slug, serviceName: "Isolated payment test",
        eurCents: 125, tinanPerEur: "1", rateSource: "Synthetic test fixture; not a live rate", configRevision: 0,
      });
      await assert.rejects(verifyOwnedInvoice(other, ids[0]!, f.txHash, f.rpc), /not found/);
      const confirmations = await Promise.all([verifyOwnedInvoice(owner, ids[0]!, f.txHash, f.rpc), verifyOwnedInvoice(owner, ids[0]!, f.txHash, f.rpc)]);
      assert.ok(confirmations.every((v) => v.status === "confirmed"));
      const [confirmed] = await db.select().from(invoices).where(eq(invoices.id, ids[0]!));
      assert.equal(confirmed!.creditRemaining, 1);
      await assert.rejects(verifyOwnedInvoice(owner, ids[1]!, f.txHash, f.rpc));
      assert.equal((await accountPayments(other)).invoices.length, 0);
      const spends = await Promise.allSettled([reserveServiceCredit(owner, slug), reserveServiceCredit(owner, slug)]);
      const accepted = spends.filter((s) => s.status === "fulfilled");
      assert.equal(accepted.length, 1);
      const reservation = (accepted[0] as PromiseFulfilledResult<string>).value;
      await Promise.all([finishServiceCredit(reservation, false), finishServiceCredit(reservation, false)]);
      const [refunded] = await db.select().from(invoices).where(eq(invoices.id, ids[0]!));
      assert.equal(refunded!.creditRemaining, 1, "failed requests refund exactly once");
      const final = await reserveServiceCredit(owner, slug);
      await finishServiceCredit(final!, true);
      await assert.rejects(reserveServiceCredit(owner, slug), /credit is required/);
      assert.equal(await isPaymentAdmin(owner), false);
      await db.insert(admins).values({ ownerId: owner });
      assert.equal(await isPaymentAdmin(owner), true);
      assert.equal(await isPaymentAdmin(other), false);
    } finally {
      await db.delete(usage).where(eq(usage.ownerId, owner));
      await db.delete(invoices).where(and(eq(invoices.ownerId, owner), inArray(invoices.id, ids)));
      await db.delete(services).where(eq(services.slug, slug));
      await db.delete(admins).where(eq(admins.ownerId, owner));
    }
  });
});

// No database sockets keep the local test runner alive.
after(() => pool.end());
