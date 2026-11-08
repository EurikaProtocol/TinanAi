import { getAddress, isAddress, zeroAddress, type Address, type Hash, type PublicClient } from 'viem';
import { tinanAiTokenAbi, tinanAiCoreAbi } from '@workspace/tinanai-contracts/abis';

export const SUPPORTED_CHAINS = [1, 11155111] as const;
export type SupportedChain = typeof SUPPORTED_CHAINS[number];
export interface ContractConfig { chainId: SupportedChain; tokenAddress: Address; coreAddress: Address }
export const EXPECTED_SUPPLY = 100_000_000n * 10n ** 18n;
export const CONTRACT_CONFIG_KEY = 'tinanai.web3.contracts.v1';

export function validateContractConfig(input: { chainId: number; tokenAddress: string; coreAddress: string }): ContractConfig {
  if (!SUPPORTED_CHAINS.includes(input.chainId as SupportedChain)) throw new Error('Choose Ethereum or Sepolia.');
  for (const value of [input.tokenAddress, input.coreAddress]) {
    if (!isAddress(value) || getAddress(value) === zeroAddress) throw new Error('Enter valid, nonzero contract addresses.');
  }
  if (input.tokenAddress.toLowerCase() === input.coreAddress.toLowerCase()) throw new Error('Token and Core addresses must be different.');
  return { chainId: input.chainId as SupportedChain, tokenAddress: getAddress(input.tokenAddress), coreAddress: getAddress(input.coreAddress) };
}

export function loadContractConfig(storage: Pick<Storage, 'getItem'>, chainId: SupportedChain): ContractConfig | null {
  const text = storage.getItem(CONTRACT_CONFIG_KEY);
  if (!text) return null;
  const map = JSON.parse(text);
  if (!map || typeof map !== 'object') throw new Error('Saved contract settings are invalid.');
  return map[chainId] ? validateContractConfig(map[chainId]) : null;
}
export function saveContractConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, input: ContractConfig) {
  const config = validateContractConfig(input);
  const text = storage.getItem(CONTRACT_CONFIG_KEY);
  const map = text ? JSON.parse(text) : {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Saved contract settings are invalid; clear them before saving.');
  storage.setItem(CONTRACT_CONFIG_KEY, JSON.stringify({ ...map, [config.chainId]: config }));
}

/** All actions in this module are read-only RPC calls. No wallet/signer is accepted. */
export async function readContractSnapshot(client: PublicClient, input: ContractConfig, account?: Address) {
  const config = validateContractConfig(input);
  if (await client.getChainId() !== config.chainId) throw new Error('RPC network does not match the selected chain.');
  const blockNumber = await client.getBlockNumber();
  const [tokenCode, coreCode] = await Promise.all([
    client.getBytecode({ address: config.tokenAddress, blockNumber }),
    client.getBytecode({ address: config.coreAddress, blockNumber }),
  ]);
  if (!tokenCode || tokenCode === '0x') throw new Error('No Token bytecode at this address on the selected network.');
  if (!coreCode || coreCode === '0x') throw new Error('No Core bytecode at this address on the selected network.');
  const token = { address: config.tokenAddress, abi: tinanAiTokenAbi, blockNumber };
  const core = { address: config.coreAddress, abi: tinanAiCoreAbi, blockNumber };
  const [name, symbol, decimals, totalSupply, linkedToken, owner, proofCount, balance] = await Promise.all([
    client.readContract({ ...token, functionName: 'name' }),
    client.readContract({ ...token, functionName: 'symbol' }),
    client.readContract({ ...token, functionName: 'decimals' }),
    client.readContract({ ...token, functionName: 'totalSupply' }),
    client.readContract({ ...core, functionName: 'token' }),
    client.readContract({ ...core, functionName: 'owner' }),
    client.readContract({ ...core, functionName: 'proofCount' }),
    account ? client.readContract({ ...token, functionName: 'balanceOf', args: [account] }) : Promise.resolve(null),
  ]);
  const problems: string[] = [];
  if (name !== 'TinanAi' || symbol !== 'TINAN' || decimals !== 18 || totalSupply !== EXPECTED_SUPPLY) {
    problems.push('Token metadata or supply does not match the fixed 100M TINAN suite.');
  }
  if (getAddress(linkedToken) !== config.tokenAddress) problems.push('Core is linked to a different token.');
  return {
    name, symbol, decimals, totalSupply, balance, owner, proofCount, linkedToken,
    blockNumber, checkedAt: new Date().toISOString(), problems,
    verified: problems.length === 0,
  };
}
export type ContractSnapshot = Awaited<ReturnType<typeof readContractSnapshot>>;

export async function readContractActivity(client: PublicClient, input: ContractConfig, account?: Address) {
  const config = validateContractConfig(input);
  if (await client.getChainId() !== config.chainId) throw new Error('RPC network does not match the selected chain.');
  const toBlock = await client.getBlockNumber();
  const fromBlock = toBlock > 499n ? toBlock - 499n : 0n;
  const common = { fromBlock, toBlock };
  const requests = [
    client.getContractEvents({ ...common, address: config.tokenAddress, abi: tinanAiTokenAbi, eventName: 'Transfer', args: account ? { from: account } : undefined }),
    ...(account ? [client.getContractEvents({ ...common, address: config.tokenAddress, abi: tinanAiTokenAbi, eventName: 'Transfer', args: { to: account } })] : []),
    client.getContractEvents({ ...common, address: config.coreAddress, abi: tinanAiCoreAbi, eventName: 'ProofRegistered', args: account ? { submitter: account } : undefined }),
  ];
  const results = await Promise.allSettled(requests);
  const events: { transactionHash: Hash | null; logIndex: number | null; blockNumber: bigint | null; eventName: string }[] = [];
  for (const result of results) if (result.status === 'fulfilled') events.push(...result.value);
  const seen = new Set<string>();
  const items = events.filter((event) => {
    const key = `${event.transactionHash}:${event.logIndex}`;
    if (!event.transactionHash || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)) || (b.logIndex ?? 0) - (a.logIndex ?? 0))
    .slice(0, 30).map((event) => ({
      hash: event.transactionHash!, blockNumber: event.blockNumber!,
      kind: event.eventName === 'Transfer' ? 'Token transfer' : 'Proof registered',
      logIndex: event.logIndex,
    }));
  return { items, fromBlock, toBlock, partial: results.some((result) => result.status === 'rejected') };
}
