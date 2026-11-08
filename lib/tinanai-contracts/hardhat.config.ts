import { createRequire } from 'node:module';
import { defineConfig } from 'hardhat/config';
import hardhatViem from '@nomicfoundation/hardhat-viem';
import hardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';

const require = createRequire(import.meta.url);
const mainnetRpcUrl = process.env.TINANAI_MAINNET_RPC_URL?.trim();

export default defineConfig({
  plugins: [hardhatViem, hardhatNodeTestRunner],
  solidity: {
    version: '0.8.38',
    // Use the installed, pinned solc-js instead of a platform-specific download.
    path: require.resolve('solc/soljson.js'),
    preferWasm: true,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  paths: {
    // Keep generated type augmentations under this package so pnpm resolves Hardhat.
    artifacts: './generated-artifacts/hardhat-artifacts',
    cache: './generated-artifacts/cache',
  },
  networks: {
    hardhatLocal: { type: 'edr-simulated', chainType: 'l1', chainId: 31337 },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      chainId: 11155111,
      url: process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
      // Signing is handled by WalletConnect in deploy.ts, never by a server-held key.
      accounts: 'remote',
    },
    // A Mainnet network exists only when its HTTPS RPC is explicitly configured.
    // It is separate from Sepolia; the Mainnet command also validates chain ID 1.
    ...(mainnetRpcUrl
      ? {
          mainnet: {
            type: 'http' as const,
            chainType: 'l1' as const,
            chainId: 1,
            url: mainnetRpcUrl,
            accounts: 'remote' as const,
          },
        }
      : {}),
  },
});
