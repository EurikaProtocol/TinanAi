import UniversalProvider from '@walletconnect/universal-provider';
import qr from 'qrcode-terminal';
import { createWalletClient, custom, getAddress } from 'viem';
import { sepolia } from 'viem/chains';

/** Ephemeral WalletConnect session storage; no session keys are written to disk. */
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

export async function connectSepoliaWallet(rpcUrl: string) {
  const projectId = process.env.VITE_REOWN_PROJECT_ID?.trim();
  if (!projectId) throw new Error('Set the public VITE_REOWN_PROJECT_ID before using WalletConnect.');
  const provider = await UniversalProvider.init({
    projectId,
    storage: memoryStorage(),
    logger: 'silent',
    metadata: {
      name: 'TINANAI Hardhat Deployer',
      description: 'Deploy TinanAiToken and TinanAiCore to Sepolia after two wallet approvals.',
      // This is a development-shell session, not a claim about the published app's domain.
      url: 'https://replit.com',
      icons: [],
    },
  });
  const close = async () => {
    if (provider.session) await provider.disconnect();
    await provider.client.core.relayer.transportClose();
  };
  provider.on('display_uri', (uri: string) => {
    console.log('Scan with your wallet. Keep this pairing QR/URI private; do not share it in chat.');
    qr.generate(uri, { small: true });
    console.log(`Pairing URI (for a wallet that supports pasting): ${uri}`);
  });
  try {
    const session = await provider.connect({
      namespaces: {
        eip155: {
          chains: ['eip155:11155111'],
          methods: ['eth_sendTransaction'],
          events: ['chainChanged', 'accountsChanged'],
          rpcMap: { '11155111': rpcUrl },
        },
      },
    });
    const account = session?.namespaces.eip155?.accounts.find((value) => value.startsWith('eip155:11155111:'));
    if (!account) throw new Error('The wallet did not approve a Sepolia account.');
    const address = getAddress(account.split(':')[2]);
    const wallet = createWalletClient({
      account: address,
      chain: sepolia,
      transport: custom({
        request: ({ method, params }) => provider.request({ method, params }, 'eip155:11155111'),
      }),
    });
    return { wallet, address, close };
  } catch (error) {
    await close();
    throw error;
  }
}
