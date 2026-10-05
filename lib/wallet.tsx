'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { createWalletClient, custom, type EIP1193Provider } from 'viem';

interface WalletState {
  address?: string;
  chainId?: number;
  hasProvider: boolean;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (id: number) => Promise<void>;
  client: () => ReturnType<typeof createWalletClient> | null;
}

const Ctx = createContext<WalletState | null>(null);

function provider(): EIP1193Provider | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum : undefined;
}

// Only the injected EIP-1193 wallet is used. The app never sees keys or seed phrases.
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState<string>();
  const [hasProvider, setHas] = useState(false);

  useEffect(() => {
    const p = provider();
    setHas(!!p);
    if (!p) return;
    p.request({ method: 'eth_accounts' }).then((a) => setAddress((a as string[])[0])).catch(() => {});
    p.request({ method: 'eth_chainId' }).then((c) => setChainId(parseInt(c as string, 16))).catch(() => {});
    const onAcc = (a: unknown) => setAddress((a as string[])[0]);
    const onChain = (c: unknown) => setChainId(parseInt(c as string, 16));
    p.on('accountsChanged', onAcc);
    p.on('chainChanged', onChain);
    return () => {
      p.removeListener('accountsChanged', onAcc);
      p.removeListener('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(undefined);
    const p = provider();
    if (!p) return setError('No browser wallet found. Install MetaMask or another EVM wallet.');
    try {
      const a = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      setAddress(a[0]);
      setChainId(parseInt((await p.request({ method: 'eth_chainId' })) as string, 16));
    } catch (e) {
      setError((e as Error).message || 'Connection rejected');
    }
  }, []);

  const switchChain = useCallback(async (id: number) => {
    const p = provider();
    if (!p) return;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + id.toString(16) }] });
    } catch (e) {
      setError((e as Error).message || 'Could not switch network');
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address, chainId, hasProvider, error, connect, switchChain,
      disconnect: () => setAddress(undefined), // wallets cannot be force-disconnected by dApps
      client: () => {
        const p = provider();
        return p ? createWalletClient({ transport: custom(p) }) : null;
      },
    }),
    [address, chainId, hasProvider, error, connect, switchChain]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error('WalletProvider missing');
  return c;
}
