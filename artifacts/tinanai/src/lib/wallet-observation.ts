import type { Eip1193Provider } from './eureka-core';

type WalletIdentity = { account: string; chainId: number };
export type WalletObservation = { account: `0x${string}`; chainId: number };

// Existing-account queries only: never opens a signing, transfer or account prompt.
export async function readWalletObservation(provider: Eip1193Provider): Promise<WalletObservation> {
  let accounts: unknown;
  let chain: unknown;
  try {
    accounts = await provider.request({ method: 'eth_accounts' });
    chain = await provider.request({ method: 'eth_chainId' });
  } catch {
    // Wallet/relay exceptions can include private pairing URIs. Never surface them.
    throw new Error('Wallet session unavailable or expired. Reconnect WalletConnect. No transaction was requested.');
  }
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0]) || /^0x0{40}$/i.test(accounts[0])) {
    throw new Error('The wallet session has no active account. Reconnect WalletConnect.');
  }
  // Injected EIP-1193 providers usually return hex. WalletConnect's EVM
  // UniversalProvider returns a number for eth_chainId; both are real reads.
  const chainId = typeof chain === 'number' ? chain
    : typeof chain === 'string' && /^0x[0-9a-fA-F]+$/.test(chain) ? Number(chain)
    : NaN;
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new Error('The wallet did not return a valid network. Reconnect and check the wallet network.');
  }
  return { account: accounts[0] as `0x${string}`, chainId };
}

export function sameWalletObservation(a: WalletIdentity, b: WalletIdentity) {
  return a.account.toLowerCase() === b.account.toLowerCase() && a.chainId === b.chainId;
}

export function observeWallet(
  provider: Eip1193Provider,
  expected: WalletIdentity,
  onChange: (observation: WalletObservation | null, error: string | null) => void,
) {
  let active = true;
  let generation = 0;
  let expired = false;
  const refresh = async (reportMismatch = true) => {
    const current = ++generation;
    onChange(null, null); // A previous green state is invalid before any asynchronous read.
    if (expired) {
      onChange(null, 'Wallet session expired. Disconnect and reconnect WalletConnect.');
      return;
    }
    try {
      const observation = await readWalletObservation(provider);
      if (!active || current !== generation) return;
      if (!sameWalletObservation(observation, expected)) {
        onChange(null, reportMismatch ? 'Wallet account or network changed. Refresh the session.' : null);
      } else onChange(observation, null);
    } catch {
      if (active && current === generation) onChange(null, 'Wallet session unavailable or expired. Reconnect WalletConnect.');
    }
  };
  const invalidate = () => {
    if (!active) return;
    expired = true;
    generation++;
    onChange(null, 'Wallet session disconnected or expired. Reconnect WalletConnect.');
  };
  const changed = () => { void refresh(false); };
  const events: [string, (...args: unknown[]) => void][] = [
    ['accountsChanged', changed], ['accountChanged', changed], ['chainChanged', changed],
    ['disconnect', invalidate], ['session_delete', invalidate], ['session_expire', invalidate],
  ];
  for (const [event, listener] of events) provider.on?.(event, listener);
  void refresh();
  return {
    refresh,
    stop() {
      active = false;
      generation++;
      for (const [event, listener] of events) provider.removeListener?.(event, listener);
    },
  };
}
