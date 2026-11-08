import UniversalProvider from '@walletconnect/universal-provider';
import qr from 'qrcode-terminal';
import { createWalletClient, custom, getAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { requireHttpsMainnetRpc } from './mainnet-safety.js';

/** Ephemeral WalletConnect session state only; no seed or private key is read or persisted. */
function memoryStorage() {
  const values = new Map<string, unknown>();
  return {
    async getKeys() { return [...values.keys()]; },
    async getEntries<T>() { return [...values.entries()] as [string, T][]; },
    async getItem<T>(key: string) { return values.get(key) as T | undefined; },
    async setItem<T>(key: string, value: T) { values.set(key, value); },
    async removeItem(key: string) { values.delete(key); },
  };
}

export async function connectMainnetWallet(rpcUrl: string) {
  const endpoint = requireHttpsMainnetRpc(rpcUrl);
  const projectId = process.env.VITE_REOWN_PROJECT_ID?.trim();
  if (!projectId) throw new Error('Set the public VITE_REOWN_PROJECT_ID before using WalletConnect.');
  const provider = await UniversalProvider.init({
    projectId,
    storage: memoryStorage(),
    logger: 'silent',
    metadata: {
      name: 'TINANAI Mainnet Token Deployer',
      description: 'One explicitly approved deployment of the existing TinanAiToken on Ethereum Mainnet.',
      url: 'https://replit.com',
      icons: [],
    },
  });
  const close = async () => {
    if (provider.session) await provider.disconnect();
    await provider.client.core.relayer.transportClose();
  };
  provider.on('display_uri', (uri: string) => {
    console.log('Scan this QR locally with the authorized owner wallet. Never share or screenshot the pairing code.');
    qr.generate(uri, { small: true });
  });
  try {
    const session = await provider.connect({
      namespaces: {
        eip155: {
          chains: ['eip155:1'],
          methods: ['eth_sendTransaction'],
          events: ['chainChanged', 'accountsChanged'],
          rpcMap: { '1': endpoint },
        },
      },
    });
    const account = session?.namespaces.eip155?.accounts.find((value) => value.startsWith('eip155:1:'));
    if (!account) throw new Error('The wallet did not approve an Ethereum Mainnet account.');
    const address = getAddress(account.split(':')[2]);
    const wallet = createWalletClient({
      account: address,
      chain: mainnet,
      transport: custom({
        request: ({ method, params }) => provider.request({ method, params }, 'eip155:1'),
      }),
    });
    if (await wallet.getChainId() !== 1) throw new Error('The connected wallet is not on Ethereum Mainnet.');
    return { wallet, address, close };
  } catch (error) {
    await close();
    throw error;
  }
}
