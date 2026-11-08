import { getAddress, isAddress, zeroAddress, type Address, type Hash } from 'viem';
import { tinanAiTokenAbi, tinanAiCoreAbi } from './generated-abis.js';

export { tinanAiTokenAbi, tinanAiCoreAbi };
export const TINANAI_SEPOLIA_CHAIN_ID = 11155111 as const;
export const TINANAI_INITIAL_SUPPLY = 100_000_000n * 10n ** 18n;

/** Produced only after the deploy script confirms both deployment receipts and settings. */
export interface TinanAiDeployment {
  status: 'confirmed';
  chainId: typeof TINANAI_SEPOLIA_CHAIN_ID;
  deployer: Address;
  tokenAddress: Address;
  coreAddress: Address;
  tokenDeploymentTxHash: Hash;
  coreDeploymentTxHash: Hash;
}

/**
 * Return wagmi/viem-compatible contract descriptors without importing Hardhat.
 * This validates configuration, not live chain state; recheck linkage via RPC.
 */
export function getTinanAiContracts(deployment: TinanAiDeployment) {
  if (deployment.status !== 'confirmed' || deployment.chainId !== TINANAI_SEPOLIA_CHAIN_ID) {
    throw new Error('A confirmed Sepolia deployment is required.');
  }
  for (const address of [deployment.tokenAddress, deployment.coreAddress]) {
    if (!isAddress(address) || getAddress(address) === zeroAddress) throw new Error('Invalid deployed contract address.');
  }
  if (deployment.tokenAddress.toLowerCase() === deployment.coreAddress.toLowerCase()) {
    throw new Error('Token and Core must have different addresses.');
  }
  return {
    token: { address: getAddress(deployment.tokenAddress), abi: tinanAiTokenAbi, chainId: TINANAI_SEPOLIA_CHAIN_ID },
    core: { address: getAddress(deployment.coreAddress), abi: tinanAiCoreAbi, chainId: TINANAI_SEPOLIA_CHAIN_ID },
  } as const;
}
