import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import tokenArtifact from '@/generated/tinan-token.json';
import type { Eip1193Provider } from './eureka-core';
import { parseInitialSupply, SEPOLIA_ID } from './launchpad-deployment';
import type { LaunchDraft } from './store';

const tokenAbi = tokenArtifact.abi as Abi;
const tokenBytecode = tokenArtifact.bytecode as Hex;
const publicClient = createPublicClient({ chain: sepolia, transport: http() });

export interface DeployTokenInput {
  provider: Eip1193Provider;
  draft: LaunchDraft;
  account: string;
  mintable: boolean;
  burnable: boolean;
}

export type DeploymentCheck =
  | { status: 'confirmed'; contractAddress: string; codePresent: boolean | null; settingsMatch: boolean | null; message: string }
  | { status: 'failed'; contractAddress: null; codePresent: false; settingsMatch: false; message: string }
  | { status: 'pending'; contractAddress: null; codePresent: null; settingsMatch: null; message: string };

function validAccounts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item))
    : [];
}

export async function submitTokenDeployment(input: DeployTokenInput): Promise<Hex> {
  const [chainResult, accountsResult] = await Promise.all([
    input.provider.request({ method: 'eth_chainId' }),
    input.provider.request({ method: 'eth_accounts' }),
  ]);
  const currentChain = typeof chainResult === 'string' ? Number(BigInt(chainResult)) : Number(chainResult);
  if (currentChain !== SEPOLIA_ID) throw new Error('The wallet is not on Sepolia. Switch networks and try again.');
  const currentAccount = validAccounts(accountsResult)[0];
  if (!currentAccount || currentAccount.toLowerCase() !== input.account.toLowerCase()) {
    throw new Error('The connected wallet account changed. Reconnect and review the deployment again.');
  }

  const client = createWalletClient({
    account: input.account as Address,
    chain: sepolia,
    transport: custom(input.provider as never),
  });
  return client.deployContract({
    account: input.account as Address,
    chain: sepolia,
    abi: tokenAbi,
    bytecode: tokenBytecode,
    args: [
      input.draft.name,
      input.draft.symbol,
      parseInitialSupply(input.draft.supply),
      input.account as Address,
      input.mintable,
      input.burnable,
    ],
  });
}

export async function checkTokenDeployment(
  hash: Hex,
  expected: { name: string; symbol: string; supply: bigint; owner: string; mintable: boolean; burnable: boolean },
): Promise<DeploymentCheck> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 90_000,
    });
    if (receipt.status === 'reverted') {
      return {
        status: 'failed',
        contractAddress: null,
        codePresent: false,
        settingsMatch: false,
        message: 'The Sepolia transaction reverted. Check the transaction details before retrying.',
      };
    }
    if (!receipt.contractAddress) {
      return {
        status: 'pending',
        contractAddress: null,
        codePresent: null,
        settingsMatch: null,
        message: 'A receipt was returned without a contract address. Check the explorer before retrying.',
      };
    }

    let codePresent: boolean | null = null;
    let settingsMatch: boolean | null = null;
    try {
      const code = await publicClient.getBytecode({ address: receipt.contractAddress });
      codePresent = Boolean(code && code !== '0x');
      if (codePresent) {
        const [name, symbol, decimals, totalSupply, owner, mintingEnabled, burningEnabled] = await Promise.all([
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'name' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'symbol' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'decimals' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'totalSupply' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'owner' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'mintingEnabled' }),
          publicClient.readContract({ address: receipt.contractAddress, abi: tokenAbi, functionName: 'burningEnabled' }),
        ]);
        settingsMatch = name === expected.name
          && symbol === expected.symbol
          && decimals === 18
          && totalSupply === expected.supply
          && String(owner).toLowerCase() === expected.owner.toLowerCase()
          && mintingEnabled === expected.mintable
          && burningEnabled === expected.burnable;
      }
    } catch {
      codePresent = null;
      settingsMatch = null;
    }

    let message = 'The Sepolia transaction is confirmed.';
    if (codePresent === true && settingsMatch === true) {
      message = 'Transaction confirmed. Deployed bytecode and token settings match the reviewed values; this is not a security audit.';
    } else if (settingsMatch === false) {
      message = 'The transaction is confirmed, but token settings did not match the expected read-back. Review the explorer before using the contract.';
    } else if (codePresent === false) {
      message = 'The transaction is confirmed, but no contract bytecode was returned. Review the explorer before using the contract.';
    } else {
      message = 'The transaction is confirmed. Bytecode or settings could not be read back from the public RPC; check the explorer for details.';
    }
    return {
      status: 'confirmed',
      contractAddress: receipt.contractAddress,
      codePresent,
      settingsMatch,
      message,
    };
  } catch {
    return {
      status: 'pending',
      contractAddress: null,
      codePresent: null,
      settingsMatch: null,
      message: 'The transaction hash is saved, but its receipt could not be confirmed yet. Check Sepolia Etherscan before retrying.',
    };
  }
}

export async function addErc20ToMetaMask(
  provider: Eip1193Provider,
  address: string,
  symbol: string,
): Promise<boolean> {
  return Boolean(await provider.request({
    method: 'wallet_watchAsset',
    params: [{
      type: 'ERC20',
      options: {
        address,
        symbol,
        decimals: 18,
      },
    }],
  }));
}
