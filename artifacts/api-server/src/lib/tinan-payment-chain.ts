import { createPublicClient, decodeEventLog, decodeFunctionData, erc20Abi, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type Hash, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { tokenArtifact } from "@workspace/tinanai-contracts/token-artifact";

export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const paymentNetworks = {
  1: { chain: mainnet, rpc: "https://ethereum-rpc.publicnode.com", minConfirmations: 12 },
  11155111: { chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com", minConfirmations: 12 },
} as const;

export function paymentClient(chainId: number): PublicClient {
  if (chainId !== 1 && chainId !== 11155111) throw new PaymentError("Unsupported payment network.");
  return createPublicClient({
    chain: paymentNetworks[chainId].chain,
    transport: http(paymentNetworks[chainId].rpc, { timeout: 10_000, retryCount: 1 }),
    cacheTime: 0,
  });
}
export function paymentAddress(value: string): Address {
  if (!isAddress(value, { strict: true }) || /^0x0{40}$/i.test(value)) throw new PaymentError("Enter a valid, nonzero Ethereum address.");
  return getAddress(value);
}
export function validatePaymentConfirmations(value: number) {
  if (!Number.isInteger(value) || value < 12 || value > 100) throw new PaymentError("Required confirmations must be an integer between 12 and 100.");
  return value;
}
export function quoteAtomic(eurCents: number, tinanPerEur: string): string {
  if (!Number.isSafeInteger(eurCents) || eurCents < 1 || eurCents > 100_000_000) throw new PaymentError("Service price must be positive integer euro cents.");
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,18})?$/.test(tinanPerEur)) throw new PaymentError("TINAN per EUR must be a positive decimal with at most 18 decimals.");
  const rate = parseUnits(tinanPerEur, 18);
  if (rate <= 0n) throw new PaymentError("The administrator must set a positive conversion rate.");
  const amount = (BigInt(eurCents) * rate + 99n) / 100n;
  if (amount > 100_000_000n * 10n ** 18n) throw new PaymentError("Quote exceeds the entire TINAN supply.");
  return amount.toString();
}
export async function validatePaymentToken(chainId: number, token: Address, client = paymentClient(chainId)) {
  if (await client.getChainId() !== chainId) throw new PaymentError("RPC chain ID does not match payment configuration.", 409);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (blockNumber < 11n) throw new PaymentError("The network has insufficient confirmation history.", 409);
  const verifiedBlock = blockNumber - 11n;
  const code = await client.getBytecode({ address: token, blockNumber: verifiedBlock });
  if (!code || code === "0x") throw new PaymentError("No token contract is deployed at the configured address.", 409);
  if (code.toLowerCase() !== tokenArtifact.deployedBytecode.toLowerCase()) throw new PaymentError("Token runtime bytecode does not match the compiled TinanAiToken contract.", 409);
  const read = (functionName: "name" | "symbol" | "decimals" | "totalSupply") => client.readContract({ address: token, abi: erc20Abi, functionName, blockNumber: verifiedBlock });
  const [name, symbol, decimals, supply] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("totalSupply")]);
  if (name !== "TinanAi" || symbol !== "TINAN" || decimals !== 18 || supply !== 100_000_000n * 10n ** 18n) {
    throw new PaymentError("Configured token does not match TinanAi / TINAN / 18 decimals / 100 million supply.", 409);
  }
  return blockNumber;
}
export interface TransferInvoice {
  payer: string; chainId: number; tokenAddress: string; treasuryAddress: string;
  amountAtomic: string; minBlock: string; createdAt: Date; expiresAt: Date; requiredConfirmations: number;
}
export interface TransferVerification {
  status: "pending" | "confirming" | "confirmed" | "failed";
  confirmations: number;
  blockNumber: string | null;
  error: string | null;
}
export async function verifyInvoiceTransfer(invoice: TransferInvoice, txHash: Hash, client = paymentClient(invoice.chainId)): Promise<TransferVerification> {
  if (await client.getChainId() !== invoice.chainId) throw new Error("RPC network mismatch.");
  let receipt;
  try { receipt = await client.getTransactionReceipt({ hash: txHash }); }
  catch (error) {
    if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return { status: "pending", confirmations: 0, blockNumber: null, error: null };
    throw error;
  }
  const failed = (error: string): TransferVerification => ({ status: "failed", confirmations: 0, blockNumber: receipt.blockNumber.toString(), error });
  if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) throw new Error("RPC receipt hash mismatch.");
  if (receipt.status !== "success") return failed("Transaction reverted on chain. No service credit was granted.");
  const [tx, block, head] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  if (block.hash !== receipt.blockHash || tx.blockHash !== receipt.blockHash || head < receipt.blockNumber) throw new Error("Receipt is not on the current canonical chain. Retry verification.");
  if (receipt.blockNumber <= BigInt(invoice.minBlock) || block.timestamp * 1000n < BigInt(invoice.createdAt.getTime()) || block.timestamp * 1000n > BigInt(invoice.expiresAt.getTime())) {
    return failed("Transfer was not included within this invoice's payment window.");
  }
  if (tx.from.toLowerCase() !== invoice.payer.toLowerCase() || tx.to?.toLowerCase() !== invoice.tokenAddress.toLowerCase() || tx.value !== 0n) return failed("Transaction sender, token target or native value does not match this invoice.");
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
    if (decoded.functionName !== "transfer" || decoded.args[0].toLowerCase() !== invoice.treasuryAddress.toLowerCase() || decoded.args[1] !== BigInt(invoice.amountAtomic)) {
      return failed("Transaction is not the exact direct ERC-20 transfer quoted by the server.");
    }
  } catch { return failed("Unable to decode the quoted ERC-20 transfer."); }
  const matches = receipt.logs.filter((log) => {
    if (log.removed || log.address.toLowerCase() !== invoice.tokenAddress.toLowerCase()) return false;
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics, strict: true });
      return event.args.from.toLowerCase() === invoice.payer.toLowerCase() && event.args.to.toLowerCase() === invoice.treasuryAddress.toLowerCase() && event.args.value === BigInt(invoice.amountAtomic);
    } catch { return false; }
  });
  if (matches.length !== 1) return failed("Receipt does not contain exactly one matching TINAN Transfer event.");
  const confirmations = Number(head - receipt.blockNumber + 1n);
  return { status: confirmations >= Math.max(12, invoice.requiredConfirmations) ? "confirmed" : "confirming", confirmations, blockNumber: receipt.blockNumber.toString(), error: null };
}

export function displayAtomic(amount: string) { return formatUnits(BigInt(amount), 18); }
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
