import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, sepolia } from '@reown/appkit/networks';
import { createConfig, http, WagmiProvider, useAccount, useBalance, useConnect, useSwitchChain } from 'wagmi';
import { disconnect as disconnectConnector, getAccount, getConnections } from '@wagmi/core';
import { useQueryClient } from '@tanstack/react-query';
import { injected } from '@wagmi/connectors';
import type { Eip1193Provider } from './eureka-core';
import { walletErrorMessage, isSupportedWalletChain, walletConnectionBusy } from './wallet-safety';
import { observeWallet, readWalletObservation, sameWalletObservation, type WalletObservation } from './wallet-observation';
import { disconnectWalletConnectSession, closeWalletSessions, createWalletSessionTransition, walletConnectorType } from './wallet-session-transition';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID?.trim() ?? '';
const networks: [typeof mainnet, typeof sepolia] = [mainnet, sepolia];
const transports = { [mainnet.id]: http('https://ethereum-rpc.publicnode.com'), [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com') };
const adapter = projectId ? new WagmiAdapter({ networks, projectId, transports }) : null;
export const wagmiConfig = adapter?.wagmiConfig ?? createConfig({
  chains: [mainnet, sepolia], connectors: [injected()], transports, multiInjectedProviderDiscovery: true,
});
const modal = adapter ? createAppKit({
  adapters: [adapter], networks, projectId,
  metadata: {
    name: 'TINANAI', description: 'Connect to inspect contracts. Transactions always require separate review and wallet approval.',
    url: window.location.origin, icons: [new URL(`${import.meta.env.BASE_URL}favicon.svg`, window.location.origin).href],
  },
  themeMode: 'dark',
  features: { analytics: false, email: false, socials: [], swaps: false, onramp: false, send: false },
}) : null;

function useWalletState() {
  const { address, chainId, connector, status: connectionStatus } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const queryClient = useQueryClient();
  const { switchChainAsync } = useSwitchChain();
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const modalOpenRef = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const [observation, setObservation] = useState<WalletObservation | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const observer = useRef<ReturnType<typeof observeWallet> | null>(null);
  const liveRevision = useRef(0);
  const liveObservation = useRef<WalletObservation | null>(null);
  const providerGeneration = useRef(0);
  const clearBalances = useCallback(async () => {
    const balances = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'balance' };
    await queryClient.cancelQueries(balances);
    queryClient.removeQueries(balances);
  }, [queryClient]);
  const clearSession = useCallback(() => {
    liveRevision.current++;
    providerGeneration.current++;
    liveObservation.current = null;
    observer.current?.stop();
    observer.current = null;
    setProvider(null);
    setObservation(null);
    setSessionRevision(previous => previous + 1);
    setSessionBlocked(true);
    setError(null);
  }, []);
  const teardown = useCallback(async () => {
    // Cancel reads before removing cached balances; late reads cannot restore them.
    await clearBalances();
    await closeWalletSessions(async () => {
      await modal?.close();
      if (modal) {
        await disconnectWalletConnectSession(
          () => modal.getUniversalProvider(),
          () => modal.disconnect('eip155'),
          () => getConnections(wagmiConfig).some(connection => walletConnectorType(connection.connector) === 'walletConnect'),
        );
      }
    }, async () => {
      // Drain every remaining connector even if one disconnect fails.
      const results = await Promise.allSettled(getConnections(wagmiConfig).map(connection =>
        disconnectConnector(wagmiConfig, { connector: connection.connector })));
      if (results.some(result => result.status === 'rejected')) throw new Error('Wallet connector cleanup failed.');
    }, () => getConnections(wagmiConfig).length > 0);
  }, [clearBalances]);
  const transition = useRef<ReturnType<typeof createWalletSessionTransition> | null>(null);
  if (!transition.current) transition.current = createWalletSessionTransition(clearSession, teardown, setTransitioning);
  useEffect(() => modal?.subscribeState((state) => {
    modalOpenRef.current = state.open;
    setModalOpen(state.open);
    // Closing the modal is NOT a disconnect signal. Mobile handoff and successful
    // approval can close it before Wagmi publishes the connected account.
    // Only an explicit disconnect or the next connection attempt tears down SDK
    // sessions; provider disconnect/session expiry still invalidate observations.
  }), []);
  useEffect(() => modal?.subscribeWalletConnectUri(() => {
    if (modalOpenRef.current && !transition.current!.busy && !getAccount(wagmiConfig).isConnected && modal.getWalletConnectUri().wcError) setError('WalletConnect pairing was rejected, expired or could not reach the relay. Retry; check the Reown project origin allowlist if it continues. No transaction was sent.');
  }), []);
  const connected = connectionStatus === 'connected' && Boolean(address) && !transitioning && !sessionBlocked;
  const nativeBalance = useBalance({
    address: connected && observation ? observation.account : undefined,
    chainId: chainId === 1 ? 1 : 11155111,
    query: { enabled: connected && Boolean(observation) && isSupportedWalletChain(chainId), refetchInterval: 30_000 },
  });
  useEffect(() => {
    let active = true;
    const generation = ++providerGeneration.current;
    liveObservation.current = null;
    setProvider(null);
    setObservation(null);
    if (connected) setError(null);
    if (connected && connector) void connector.getProvider().then((value) => {
      if (!active || generation !== providerGeneration.current) return;
      const currentProvider = value as Eip1193Provider;
      setProvider(currentProvider);
      observer.current = observeWallet(currentProvider, { account: address!, chainId: chainId ?? 0 }, (next, reason) => {
        if (!active || generation !== providerGeneration.current) return;
        liveRevision.current++;
        liveObservation.current = next;
        if (!next) void clearBalances();
        setObservation(next);
        setSessionRevision(previous => previous + 1);
        setError(reason);
      });
    }).catch(() => { if (active && generation === providerGeneration.current) setError('The wallet provider is unavailable. Reconnect your wallet.'); });
    return () => { active = false; providerGeneration.current++; liveObservation.current = null; liveRevision.current++; observer.current?.stop(); observer.current = null; };
  }, [connector, address, chainId, connected, clearBalances]);
  const readSession = useCallback(async () => {
    if (!connected || !provider || !observation || !liveObservation.current || !sameWalletObservation(observation, liveObservation.current)) throw new Error('No verified active wallet provider. Connect or refresh WalletConnect.');
    const revision = liveRevision.current;
    const fresh = await readWalletObservation(provider);
    if (!liveObservation.current || revision !== liveRevision.current || !sameWalletObservation(fresh, liveObservation.current)) throw new Error('Wallet changed. Refresh the session and rerun preflight.');
    return fresh;
  }, [connected, provider, observation]);
  const startConnection = useCallback(async (connect: () => Promise<unknown>) => {
    if (modalOpenRef.current || transition.current!.busy) return;
    try {
      await transition.current!.run(async () => {
        setSessionBlocked(false);
        await connect();
      });
    } catch (error) { setError(walletErrorMessage(error)); }
  }, []);
  const connectInjected = useCallback(async () => {
    const browser = connectors.find((item) => item.type === 'injected');
    if (!browser) { setError('No browser wallet was detected. Use WalletConnect for a mobile wallet.'); return; }
    await startConnection(() => connectAsync({ connector: browser }));
  }, [connectAsync, connectors, startConnection]);
  const connectWallet = useCallback(async () => {
    if (modal) await startConnection(() => modal.open({ view: 'Connect', namespace: 'eip155' }));
    else await connectInjected();
  }, [connectInjected, startConnection]);
  const connectWalletConnect = useCallback(async () => {
    if (!modal) { setError('Mobile wallet connection is unavailable until a public Reown project ID is configured.'); return; }
    // Public AppKit view initializes WalletConnect and its QR/deeplink flow.
    // Unlike the generic Connect picker, desktop does not default to injected.
    await startConnection(() => modal.open({ view: 'ConnectingWalletConnectBasic', namespace: 'eip155' }));
  }, [startConnection]);
  const switchNetwork = useCallback(async (next: 1 | 11155111) => {
    if (transition.current!.busy || modalOpenRef.current) return;
    setError(null);
    if (!connected) { setError('Connect a wallet before switching networks.'); return; }
    try { await switchChainAsync({ chainId: next }); }
    catch (error) { setError(walletErrorMessage(error)); }
  }, [connected, switchChainAsync]);
  const disconnect = useCallback(async () => {
    try { await transition.current!.run(async () => {}); }
    catch (error) { setError(walletErrorMessage(error)); }
  }, []);
  return {
    connectorType: connected && observation ? walletConnectorType(connector) : null,
    account: connected && observation ? observation.account : null, chainId: connected && observation ? observation.chainId : null,
    connected: connected && Boolean(observation), sessionActive: connected, sessionRevision,
    refreshSession: () => observer.current?.refresh(), readSession,
    connecting: transitioning || modalOpen || walletConnectionBusy(isPending, connectionStatus, modalOpen),
    supported: connected && Boolean(observation) && isSupportedWalletChain(chainId), provider: connected && observation ? provider : null, error,
    walletConnectAvailable: Boolean(projectId), connectWallet, connectInjected, connectWalletConnect,
    disconnect, switchNetwork,
    balance: connected && observation && isSupportedWalletChain(chainId) ? nativeBalance.data : undefined,
    balanceLoading: connected && Boolean(observation) && nativeBalance.isLoading,
    balanceError: connected && observation ? nativeBalance.error?.message ?? null : null,
  };
}
type Web3Wallet = ReturnType<typeof useWalletState>;
const WalletContext = createContext<Web3Wallet | null>(null);
function WalletStateProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletState();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}
export function Web3WalletProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}><WalletStateProvider>{children}</WalletStateProvider></WagmiProvider>;
}
export function useWeb3Wallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('Web3 wallet provider is missing.');
  return context;
}
