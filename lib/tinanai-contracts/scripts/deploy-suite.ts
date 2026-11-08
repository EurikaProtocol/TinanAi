import {
  getAddress, isAddress, zeroAddress,
  type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem';
import { tinanAiTokenAbi, tinanAiCoreAbi, TINANAI_INITIAL_SUPPLY } from '../src/index.js';

export interface DeploymentProgress {
  schemaVersion: 1;
  chainId: number;
  deployer: Address;
  status: 'in-progress' | 'confirmed';
  tokenAddress?: Address;
  coreAddress?: Address;
  tokenDeploymentTxHash?: Hex;
  coreDeploymentTxHash?: Hex;
}

export function parseDeploymentProgress(value: unknown): DeploymentProgress {
  if (!value || typeof value !== 'object') throw new Error('Invalid deployment journal.');
  const state = value as DeploymentProgress;
  if (state.schemaVersion !== 1 || ![31337, 11155111].includes(state.chainId)
    || !isAddress(state.deployer ?? '') || state.deployer === zeroAddress
    || !['in-progress', 'confirmed'].includes(state.status)) throw new Error('Invalid deployment journal.');
  for (const address of [state.tokenAddress, state.coreAddress]) {
    if (address !== undefined && (!isAddress(address) || address === zeroAddress)) throw new Error('Invalid saved contract address.');
  }
  for (const hash of [state.tokenDeploymentTxHash, state.coreDeploymentTxHash]) {
    if (hash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid saved transaction hash.');
  }
  if ((state.tokenAddress && !state.tokenDeploymentTxHash) || (state.coreAddress && !state.coreDeploymentTxHash)
    || (state.coreDeploymentTxHash && !state.tokenDeploymentTxHash)
    || (state.status === 'confirmed' && (!state.tokenAddress || !state.coreAddress))) {
    throw new Error('Incomplete deployment journal. Inspect it before retrying.');
  }
  return state;
}

/** Deploy sequentially; checkpoint each hash before waiting, and resume existing hashes. */
export async function deploySuite(options: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  tokenBytecode: Hex;
  coreBytecode: Hex;
  previous?: DeploymentProgress;
  record?: (progress: DeploymentProgress) => void;
}) {
  const { publicClient, walletClient } = options;
  const chainId = await publicClient.getChainId();
  if (![31337, 11155111].includes(chainId)) throw new Error('Only local Hardhat and Sepolia deployments are allowed.');
  const account = walletClient.account;
  if (!account) throw new Error('A connected wallet is required.');
  const deployer = getAddress(account.address);
  if (options.previous) {
    parseDeploymentProgress(options.previous);
    if (options.previous.chainId !== chainId || getAddress(options.previous.deployer) !== deployer) {
      throw new Error('The saved deployment belongs to a different chain or wallet. Nothing was sent.');
    }
  }
  let state: DeploymentProgress = options.previous
    ? { ...options.previous }
    : { schemaVersion: 1, chainId, deployer, status: 'in-progress' };
  const save = (patch: Partial<DeploymentProgress>) => {
    state = { ...state, ...patch };
    options.record?.({ ...state });
  };

  // Phase 1: Token must exist and match expectations before Core is deployed.
  if (!state.tokenDeploymentTxHash) {
    const hash = await walletClient.deployContract({
      account, chain: walletClient.chain ?? null, abi: tinanAiTokenAbi,
      bytecode: options.tokenBytecode, args: [deployer],
    });
    save({ tokenDeploymentTxHash: hash });
  }
  const tokenReceipt = await publicClient.waitForTransactionReceipt({
    hash: state.tokenDeploymentTxHash!, confirmations: 1, timeout: 120_000,
  });
  if (tokenReceipt.status !== 'success' || !tokenReceipt.contractAddress) throw new Error('Token deployment failed. Inspect the saved transaction; do not delete the journal blindly.');
  const tokenAddress = getAddress(tokenReceipt.contractAddress);
  if (state.tokenAddress && getAddress(state.tokenAddress) !== tokenAddress) throw new Error('Saved Token address differs from the receipt.');
  save({ tokenAddress, tokenDeploymentTxHash: tokenReceipt.transactionHash });
  const [name, symbol, decimals, supply, tokenCode] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: tinanAiTokenAbi, functionName: 'name' }),
    publicClient.readContract({ address: tokenAddress, abi: tinanAiTokenAbi, functionName: 'symbol' }),
    publicClient.readContract({ address: tokenAddress, abi: tinanAiTokenAbi, functionName: 'decimals' }),
    publicClient.readContract({ address: tokenAddress, abi: tinanAiTokenAbi, functionName: 'totalSupply' }),
    publicClient.getBytecode({ address: tokenAddress }),
  ]);
  if (name !== 'TinanAi' || symbol !== 'TINAN' || decimals !== 18
    || supply !== TINANAI_INITIAL_SUPPLY || !tokenCode || tokenCode === '0x') {
    throw new Error('Token settings or deployed code did not pass read-back. Core was not deployed.');
  }

  // Phase 2: Link the registry to the actual confirmed Token address, not a placeholder.
  if (!state.coreDeploymentTxHash) {
    const hash = await walletClient.deployContract({
      account, chain: walletClient.chain ?? null, abi: tinanAiCoreAbi,
      bytecode: options.coreBytecode, args: [tokenAddress, deployer],
    });
    save({ coreDeploymentTxHash: hash });
  }
  const coreReceipt = await publicClient.waitForTransactionReceipt({
    hash: state.coreDeploymentTxHash!, confirmations: 1, timeout: 120_000,
  });
  if (coreReceipt.status !== 'success' || !coreReceipt.contractAddress) throw new Error('Core deployment failed. Token remains deployed; inspect the journal before retrying.');
  const coreAddress = getAddress(coreReceipt.contractAddress);
  if (state.coreAddress && getAddress(state.coreAddress) !== coreAddress) throw new Error('Saved Core address differs from the receipt.');
  save({ coreAddress, coreDeploymentTxHash: coreReceipt.transactionHash });
  const [linkedToken, owner, coreCode] = await Promise.all([
    publicClient.readContract({ address: coreAddress, abi: tinanAiCoreAbi, functionName: 'token' }),
    publicClient.readContract({ address: coreAddress, abi: tinanAiCoreAbi, functionName: 'owner' }),
    publicClient.getBytecode({ address: coreAddress }),
  ]);
  if (getAddress(linkedToken) !== tokenAddress || getAddress(owner) !== deployer || !coreCode || coreCode === '0x') {
    throw new Error('Core linkage, owner or deployed code did not pass read-back.');
  }
  save({ status: 'confirmed' });
  return state;
}
