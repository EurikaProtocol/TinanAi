import { useWeb3Wallet, Web3WalletProvider } from './web3-wallet';

// Preserve the existing Sepolia-only Launchpad API while sharing the header wallet.
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';
export type LaunchpadWalletStatus = 'idle' | 'connecting' | 'wrong-network' | 'unavailable' | 'ready';
export const LaunchpadWalletProvider = Web3WalletProvider;
export function useLaunchpadWallet() {
  const wallet = useWeb3Wallet();
  const status: LaunchpadWalletStatus = wallet.connecting ? 'connecting'
    : !wallet.account ? 'idle' : wallet.chainId === SEPOLIA_CHAIN_ID ? 'ready' : 'wrong-network';
  return { ...wallet, status, switchToSepolia: () => wallet.switchNetwork(SEPOLIA_CHAIN_ID) };
}
