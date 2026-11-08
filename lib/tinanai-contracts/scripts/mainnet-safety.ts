import { closeSync, existsSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import {
  encodeDeployData,
  formatEther,
  getAddress,
  isAddress,
  keccak256,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { mainnet } from 'viem/chains';
import { tinanAiTokenAbi } from '../src/index.js';
import { TINANAI_INITIAL_SUPPLY } from '../src/index.js';
import { assertCreationSimulationAuthorized, isConfirmedHistoricalRecord } from '../src/mainnet-identity.js';

export const TINANAI_MAINNET_CHAIN_ID = 1 as const;
export const MAINNET_DEPLOYMENT_CONFIRMATIONS = 12;
export const MAINNET_TOKEN_SUPPLY = TINANAI_INITIAL_SUPPLY;

export interface TokenArtifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
}

export function assertMainnetChainId(chainId: number): void {
  if (chainId !== TINANAI_MAINNET_CHAIN_ID) {
    throw new Error(`Wrong network: expected Ethereum Mainnet (chain ID 1), received ${chainId}. Nothing was sent.`);
  }
}

export function requireHttpsMainnetRpc(value: string | undefined): string {
  if (!value?.trim()) throw new Error('Configure TINANAI_MAINNET_RPC_URL before using the Mainnet commands.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('TINANAI_MAINNET_RPC_URL must be a valid HTTPS endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('TINANAI_MAINNET_RPC_URL must be HTTPS and must not include embedded credentials or a fragment.');
  }
  return url.toString();
}

export interface ConfiguredPaymentCatalog {
  chainId: 1 | 11155111;
  tokenAddress: string | null;
  enabled: boolean;
  ready: boolean;
}

/** Read the public TINAN payment registry before any wallet is connected. */
export async function readConfiguredPaymentCatalog(
  endpoint: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ConfiguredPaymentCatalog> {
  if (!endpoint?.trim()) {
    throw new Error('Set TINANAI_MAINNET_PAYMENT_CATALOG_URL to the project payment-catalog endpoint before Mainnet deployment.');
  }
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('The configured payment-catalog endpoint is invalid.'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new Error('The payment-catalog endpoint must use HTTPS (HTTP is allowed only for localhost) and must not embed credentials.');
  }
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Could not safely read the configured payment registry. No wallet will be connected and no deployment will be attempted.');
  }
  if (!response.ok) throw new Error(`The configured payment registry returned HTTP ${response.status}. No deployment will be attempted.`);
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error('The configured payment registry returned invalid JSON. No deployment will be attempted.'); }
  const settings = result && typeof result === 'object'
    ? (result as { settings?: unknown }).settings
    : undefined;
  if (!settings || typeof settings !== 'object') {
    throw new Error('The configured payment registry response is missing settings. No deployment will be attempted.');
  }
  const record = settings as { chainId?: unknown; tokenAddress?: unknown; enabled?: unknown };
  if (![1, 11155111].includes(Number(record.chainId))
    || typeof record.enabled !== 'boolean'
    || (record.tokenAddress !== null && typeof record.tokenAddress !== 'string')) {
    throw new Error('The configured payment registry has an unexpected shape or unsupported chain. No deployment will be attempted.');
  }
  const tokenAddress = record.tokenAddress as string | null;
  if ((record.enabled && !tokenAddress) || (tokenAddress && !isAddress(tokenAddress, { strict: true }))) {
    throw new Error('The configured payment registry is inconsistent or has an invalid token address. No deployment will be attempted.');
  }
  if (typeof (result as { ready?: unknown }).ready !== 'boolean') {
    throw new Error('The configured payment registry has no readiness status. No deployment will be attempted.');
  }
  return {
    chainId: Number(record.chainId) as 1 | 11155111,
    tokenAddress: tokenAddress ? getAddress(tokenAddress) : null,
    enabled: record.enabled,
    ready: (result as { ready: boolean }).ready,
  };
}

export function assertAuthorizedDeployer(connectedAddress: string | undefined, expectedAddress: string | undefined): Address {
  if (!connectedAddress) throw new Error('No wallet signer was connected. No transaction was submitted.');
  if (!expectedAddress || !isAddress(expectedAddress, { strict: true }) || getAddress(expectedAddress) === zeroAddress) {
    throw new Error('Set TINANAI_MAINNET_AUTHORIZED_DEPLOYER to the project-owner-approved wallet address.');
  }
  const connected = getAddress(connectedAddress);
  if (connected !== getAddress(expectedAddress)) {
    throw new Error(`Connected wallet ${connected} does not match the authorized deployer. No transaction was submitted.`);
  }
  return connected;
}

export function buildTokenOnlyCreationData(artifact: TokenArtifact, initialHolder: string): Hex {
  if (!artifact.bytecode || artifact.bytecode === '0x' || !artifact.deployedBytecode || artifact.deployedBytecode === '0x') {
    throw new Error('The compiled TinanAiToken artifact is missing creation or runtime bytecode.');
  }
  const constructors = artifact.abi.filter((item) => item.type === 'constructor');
  if (constructors.length !== 1 || constructors[0]?.inputs.length !== 1 || constructors[0].inputs[0]?.type !== 'address') {
    throw new Error('Unexpected TinanAiToken constructor. Refusing to deploy.');
  }
  const holder = getAddress(initialHolder);
  if (holder === zeroAddress) throw new Error('The TINAN initial holder cannot be the zero address.');
  return encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [holder] });
}

/**
 * Refuses every recorded Mainnet deployment. A missing file is not proof of
 * nonexistence, so the caller must also obtain an explicit human declaration.
 */
export function assertNoRecordedMainnetDeployment(deploymentsDir: string): void {
  if (!existsSync(deploymentsDir)) throw new Error(`Deployment-record directory is unavailable: ${deploymentsDir}`);
  const mainnetManifest = path.join(deploymentsDir, 'mainnet.json');
  if (existsSync(mainnetManifest)) {
    throw new Error('A Mainnet deployment record already exists. Verify that address; do not deploy another token.');
  }
  for (const filename of readdirSync(deploymentsDir).filter((name) => name.endsWith('.json'))) {
    const fullPath = path.join(deploymentsDir, filename);
    let record: unknown;
    try { record = JSON.parse(readFileSync(fullPath, 'utf8')); }
    catch { throw new Error(`Could not safely inspect deployment record "${filename}". No deployment will be attempted.`); }
    if (record && typeof record === 'object') {
      const entry = record as { chainId?: unknown; network?: unknown; tokenAddress?: unknown; contractAddress?: unknown; token?: unknown; status?: unknown; targetId?: unknown };
      const nestedTokenAddress = entry.token && typeof entry.token === 'object'
        ? (entry.token as { address?: unknown }).address
        : undefined;
      const address = entry.contractAddress ?? entry.tokenAddress ?? nestedTokenAddress;
      const indicatesMainnet = Number(entry.chainId) === 1 || ['mainnet', 'ethereum mainnet'].includes(String(entry.network ?? '').toLowerCase());
      if (indicatesMainnet) {
        // Only explicitly confirmed historical identities are separate. Never
        // ignore an uncertain record, the dedicated mainnet.json, or a target match.
        if (isConfirmedHistoricalRecord(record)) continue;
        throw new Error(`A Mainnet record exists in "${filename}"${typeof address === 'string' && address.length > 0 ? ' with a known token address' : ' without a confirmed address'}. Reconcile it; do not deploy another token.`);
      }
    }
  }
  if (readdirSync(deploymentsDir).some(name => name.endsWith('.json.tmp'))) {
    throw new Error('An interrupted temporary deployment journal exists. Reconcile it before any deployment attempt.');
  }
}

/** Process-level exclusive lock; stale locks require human recovery, never auto-delete. */
export function acquireMainnetDeploymentLock(lockPath: string): () => void {
  let descriptor: number;
  try { descriptor = openSync(lockPath, 'wx', 0o600); }
  catch { throw new Error('A Mainnet deployment lock already exists or cannot be created. Inspect the wallet and journal before retrying.'); }
  try { writeSync(descriptor, `${process.pid}\n`); }
  catch (error) {
    closeSync(descriptor);
    try { unlinkSync(lockPath); } catch { /* preserve the original lock-write error */ }
    throw error;
  }
  return () => {
    closeSync(descriptor);
    unlinkSync(lockPath);
  };
}

export interface MainnetPreflight {
  estimateGas: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  maximumCostWei: bigint;
  balanceWei: bigint;
}

export async function estimateMainnetDeployment(
  publicClient: Pick<PublicClient, 'getChainId' | 'estimateGas' | 'estimateFeesPerGas' | 'getBalance'>,
  account: Address,
  creationData: Hex,
  simulationAuthorization?: string,
): Promise<MainnetPreflight> {
  assertCreationSimulationAuthorized(simulationAuthorization);
  assertMainnetChainId(await publicClient.getChainId());
  let estimatedGas: bigint;
  try {
    estimatedGas = await publicClient.estimateGas({ account, data: creationData });
  } catch {
    throw new Error('Mainnet deployment gas estimation failed. No transaction was submitted.');
  }
  if (estimatedGas <= 0n) throw new Error('Mainnet gas estimation returned an invalid limit.');
  const gasLimit = (estimatedGas * 120n + 99n) / 100n;
  let fees;
  try { fees = await publicClient.estimateFeesPerGas(); }
  catch { throw new Error('Mainnet fee-cap estimation failed. No transaction was submitted.'); }
  if (!fees.maxFeePerGas || !fees.maxPriorityFeePerGas || fees.maxFeePerGas <= 0n || fees.maxPriorityFeePerGas <= 0n) {
    throw new Error('The Mainnet RPC did not provide EIP-1559 fee caps. No transaction was submitted.');
  }
  let balanceWei: bigint;
  try { balanceWei = await publicClient.getBalance({ address: account }); }
  catch { throw new Error('Could not read the deployer ETH balance. No transaction was submitted.'); }
  const maximumCostWei = gasLimit * fees.maxFeePerGas;
  if (balanceWei < maximumCostWei) {
    throw new Error(`Insufficient ETH for the displayed maximum deployment fee (${formatEther(maximumCostWei)} ETH). No transaction was submitted.`);
  }
  return {
    estimateGas: estimatedGas,
    gasLimit,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maximumCostWei,
    balanceWei,
  };
}

export async function requestTokenOnlyDeployment(
  walletClient: Pick<WalletClient, 'deployContract'>,
  artifact: TokenArtifact,
  account: Address,
  gas: MainnetPreflight,
) {
  return walletClient.deployContract({
    account,
    chain: mainnet,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account],
    gas: gas.gasLimit,
    maxFeePerGas: gas.maxFeePerGas,
    maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
  });
}

export async function verifyExistingMainnetToken(
  client: PublicClient,
  tokenAddress: string,
  expectedRuntimeBytecode: Hex,
) {
  const chainId = await client.getChainId();
  assertMainnetChainId(chainId);
  const address = getAddress(tokenAddress);
  if (address === zeroAddress) throw new Error('The provided address cannot be the zero address.');
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === '0x') throw new Error('The provided address has no deployed code on Ethereum Mainnet.');
  const runtimeBytecodeMatches = code.toLowerCase() === expectedRuntimeBytecode.toLowerCase();
  const read = (functionName: 'name' | 'symbol' | 'decimals' | 'totalSupply') =>
    client.readContract({ address, abi: tinanAiTokenAbi, functionName, blockNumber });
  let name: unknown, symbol: unknown, decimals: unknown, totalSupply: unknown;
  try {
    [name, symbol, decimals, totalSupply] = await Promise.all([
      read('name'), read('symbol'), read('decimals'), read('totalSupply'),
    ]);
  } catch {
    throw new Error('The provided address does not expose the expected TINAN ERC-20 reads.');
  }
  const metadataMatches = name === 'TinanAi' && symbol === 'TINAN' && decimals === 18 && totalSupply === MAINNET_TOKEN_SUPPLY;
  if (!runtimeBytecodeMatches || !metadataMatches) {
    throw new Error('Existing address verification failed: the code or TinanAi/TINAN/18-decimal/100M-supply checks do not match.');
  }
  return {
    address,
    chainId,
    blockNumber: blockNumber.toString(),
    runtimeBytecodeHash: keccak256(code),
    metadataMatches,
    runtimeBytecodeMatches,
  };
}

export function formatMainnetMaximumCost(value: bigint): string {
  return `${formatEther(value)} ETH`;
}
