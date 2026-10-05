// Configurable chain registry. RPC URLs and contract addresses come from env vars; nothing secret is hardcoded.
export interface ChainConfig {
  id: number;
  key: string;
  name: string;
  explorer: string;
  currency: string;
  rpcUrl?: string;
  tokenFactory?: string;
  projectRegistry?: string;
  dataProofRegistry?: string;
}

// NOTE: process.env.NEXT_PUBLIC_* must be referenced statically so Next can inline them.
export const CHAINS: ChainConfig[] = [
  { id: 1, key: 'ethereum', name: 'Ethereum', explorer: 'https://etherscan.io', currency: 'ETH',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
    tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ETHEREUM,
    projectRegistry: process.env.NEXT_PUBLIC_PROJECT_REGISTRY_ETHEREUM,
    dataProofRegistry: process.env.NEXT_PUBLIC_DATA_PROOF_REGISTRY_ETHEREUM },
  { id: 8453, key: 'base', name: 'Base', explorer: 'https://basescan.org', currency: 'ETH',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_BASE,
    tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY_BASE,
    projectRegistry: process.env.NEXT_PUBLIC_PROJECT_REGISTRY_BASE,
    dataProofRegistry: process.env.NEXT_PUBLIC_DATA_PROOF_REGISTRY_BASE },
  { id: 42161, key: 'arbitrum', name: 'Arbitrum', explorer: 'https://arbiscan.io', currency: 'ETH',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
    tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ARBITRUM,
    projectRegistry: process.env.NEXT_PUBLIC_PROJECT_REGISTRY_ARBITRUM,
    dataProofRegistry: process.env.NEXT_PUBLIC_DATA_PROOF_REGISTRY_ARBITRUM },
  { id: 137, key: 'polygon', name: 'Polygon', explorer: 'https://polygonscan.com', currency: 'POL',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_POLYGON,
    tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY_POLYGON,
    projectRegistry: process.env.NEXT_PUBLIC_PROJECT_REGISTRY_POLYGON,
    dataProofRegistry: process.env.NEXT_PUBLIC_DATA_PROOF_REGISTRY_POLYGON },
  { id: 56, key: 'bnb', name: 'BNB Chain', explorer: 'https://bscscan.com', currency: 'BNB',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_BNB,
    tokenFactory: process.env.NEXT_PUBLIC_TOKEN_FACTORY_BNB,
    projectRegistry: process.env.NEXT_PUBLIC_PROJECT_REGISTRY_BNB,
    dataProofRegistry: process.env.NEXT_PUBLIC_DATA_PROOF_REGISTRY_BNB },
];

// Solana is a separate (non-EVM) adapter and is not implemented yet.
export const SOLANA_ADAPTER = { name: 'Solana', status: 'COMING SOON' as const };

export const getChain = (id?: number) => CHAINS.find((c) => c.id === id);

// Existing token: network is intentionally NOT assumed. Never redeployed by this app.
export const EXISTING_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_EXISTING_TOKEN_ADDRESS || '0x4042973c0863CCA0D73F028cA98465F44F0e6F97';
export const EXISTING_TOKEN_CHAIN_ID = process.env.NEXT_PUBLIC_EXISTING_TOKEN_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_EXISTING_TOKEN_CHAIN_ID)
  : undefined;

export const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || '';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tinaneureka.com';
