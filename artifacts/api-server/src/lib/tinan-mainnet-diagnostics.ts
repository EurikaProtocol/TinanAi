import { createPublicClient, formatEther, getAddress, http, isAddress, zeroAddress } from "viem";
import { mainnet } from "viem/chains";

/** Deliberately excludes estimateGas, eth_call, wallet clients and all writes. */
export interface MainnetDiagnosticClient {
  getChainId(): Promise<number>;
  getBlock(): Promise<{ number: bigint | null; hash: string | null; timestamp: bigint }>;
  getBalance(input: { address: `0x${string}`; blockNumber: bigint }): Promise<bigint>;
  getTransactionCount(input: { address: `0x${string}`; blockNumber?: bigint; blockTag?: "pending" }): Promise<number>;
}

function createMainnetDiagnosticClient(url: string): MainnetDiagnosticClient {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(url, { timeout: 10_000, retryCount: 0, fetchOptions: { redirect: "error" } }),
  });

  return {
    getChainId: () => client.getChainId(),
    getBlock: async () => {
      const block = await client.getBlock();
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    getBalance: ({ address, blockNumber }) => client.getBalance({ address, blockNumber }),
    getTransactionCount: ({ address, blockNumber, blockTag }) => {
      if (blockTag === "pending" && blockNumber === undefined) {
        return client.getTransactionCount({ address, blockTag });
      }
      if (blockNumber !== undefined && blockTag === undefined) {
        return client.getTransactionCount({ address, blockNumber });
      }
      throw new Error("Provide either a block number or the pending block tag.");
    },
  };
}

export async function diagnoseMainnetRpc(
  rpcUrl: string | undefined,
  approvedDeployer: string | null,
  makeClient: (url: string) => MainnetDiagnosticClient = createMainnetDiagnosticClient,
) {
  const result = {
    status: "BLOCKED" as "PASS" | "FAIL" | "BLOCKED",
    detail: "Server-side Mainnet RPC and an approved deployer are required.",
    chainId: null as number | null, blockNumber: null as string | null,
    blockHash: null as string | null, blockTime: null as string | null,
    balanceEth: null as string | null, nonce: null as string | null, pendingNonce: null as string | null,
  };
  let endpoint: URL;
  try {
    endpoint = new URL(rpcUrl ?? "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) return result;
    if (!approvedDeployer || !isAddress(approvedDeployer) || getAddress(approvedDeployer) === zeroAddress) return result;
  } catch { return result; }
  try {
    const client = makeClient(endpoint.toString());
    result.chainId = await client.getChainId();
    if (result.chainId !== 1) return { ...result, status: "FAIL" as const, detail: "RPC network is not Ethereum Mainnet chain ID 1." };
    const block = await client.getBlock();
    if (block.number === null || block.number < 0n || !block.hash || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || block.timestamp <= 0n) throw new Error();
    const address = getAddress(approvedDeployer!);
    const [balance, nonce, pending] = await Promise.all([
      client.getBalance({ address, blockNumber: block.number }),
      client.getTransactionCount({ address, blockNumber: block.number }),
      client.getTransactionCount({ address, blockTag: "pending" }),
    ]);
    if (balance < 0n || !Number.isSafeInteger(nonce) || nonce < 0 || !Number.isSafeInteger(pending) || pending < nonce) throw new Error();
    return {
      ...result, status: "PASS" as const,
      detail: "Server RPC reads completed. Block-pinned balance and confirmed nonce; pending nonce is a separate observation. No simulation or database write.",
      blockNumber: block.number.toString(), blockHash: block.hash,
      blockTime: new Date(Number(block.timestamp) * 1000).toISOString(),
      balanceEth: formatEther(balance), nonce: String(nonce), pendingNonce: String(pending),
    };
  } catch {
    // Never return/log provider exceptions: they may contain credential-bearing URLs.
    return { ...result, status: "FAIL" as const, detail: "Server RPC diagnostics failed. Provider details and endpoint are hidden." };
  }
}
