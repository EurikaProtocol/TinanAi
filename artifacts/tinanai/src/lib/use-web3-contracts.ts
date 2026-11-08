import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useWeb3Wallet } from './web3-wallet';
import {
  CONTRACT_CONFIG_KEY, loadContractConfig, saveContractConfig, validateContractConfig,
  readContractActivity, readContractSnapshot, type ContractConfig, type SupportedChain,
} from './web3-contracts';

export function useContractDashboard() {
  const wallet = useWeb3Wallet();
  const [chainId, setChainId] = useState<SupportedChain>(11155111);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const client = usePublicClient({ chainId });
  const load = useCallback(() => {
    try { setConfig(loadContractConfig(localStorage, chainId)); setConfigError(null); }
    catch { setConfig(null); setConfigError('Saved contract addresses could not be loaded. Clear the settings and enter verified addresses.'); }
  }, [chainId]);
  useEffect(() => {
    load();
    const changed = (event: StorageEvent) => { if (event.key === CONTRACT_CONFIG_KEY || event.key === null) load(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [load]);
  const effectiveConfig = config?.chainId === chainId ? config : null;
  const snapshot = useQuery({
    queryKey: ['tinanai-contract-snapshot', chainId, effectiveConfig?.tokenAddress, effectiveConfig?.coreAddress, wallet.account],
    enabled: Boolean(effectiveConfig && client), retry: 1, staleTime: 20_000, refetchInterval: 30_000,
    queryFn: () => readContractSnapshot(client!, effectiveConfig!, wallet.account ?? undefined),
  });
  const activity = useQuery({
    queryKey: ['tinanai-contract-activity', chainId, effectiveConfig?.tokenAddress, effectiveConfig?.coreAddress, wallet.account],
    enabled: Boolean(effectiveConfig && client && snapshot.data?.verified), retry: 0, staleTime: 30_000, refetchInterval: 60_000,
    queryFn: () => readContractActivity(client!, effectiveConfig!, wallet.account ?? undefined),
  });
  function saveAddresses(tokenAddress: string, coreAddress: string) {
    try {
      const next = validateContractConfig({ chainId, tokenAddress: tokenAddress.trim(), coreAddress: coreAddress.trim() });
      saveContractConfig(localStorage, next);
      setConfig(next); setConfigError(null);
      return true;
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'Addresses could not be saved.'); return false; }
  }
  function clearAddresses() {
    try {
      const text = localStorage.getItem(CONTRACT_CONFIG_KEY);
      let map: Record<string, unknown> = {};
      try { map = text ? JSON.parse(text) : {}; } catch { /* Explicit clear repairs invalid storage. */ }
      delete map[chainId];
      localStorage.setItem(CONTRACT_CONFIG_KEY, JSON.stringify(map));
      setConfig(null); setConfigError(null);
    } catch { setConfigError('Browser storage is unavailable; settings were not cleared.'); }
  }
  return { chainId, setChainId, config: effectiveConfig, configError, saveAddresses, clearAddresses, snapshot, activity, wallet,
    refresh: () => { void snapshot.refetch(); if (snapshot.data?.verified) void activity.refetch(); } };
}
