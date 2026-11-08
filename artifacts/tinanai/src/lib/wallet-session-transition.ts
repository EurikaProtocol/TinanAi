/** Serializes teardown/pairing across all connection buttons, including rapid taps. */
export function createWalletSessionTransition(
  clear: () => void,
  disconnect: () => Promise<void>,
  onBusy: (busy: boolean) => void,
) {
  let busy = false;
  return {
    get busy() { return busy; },
    async run(connect: () => Promise<unknown>): Promise<boolean> {
      if (busy) return false;
      busy = true;
      onBusy(true);
      try {
        clear();
        await disconnect();
        await connect();
        return true;
      } finally {
        busy = false;
        onBusy(false);
      }
    },
  };
}

/** Never label an injected wallet as WalletConnect based on its display name. */
export function walletConnectorType(connector: { type: string; id?: string } | undefined): string | null {
  if (!connector) return null;
  if (connector.type === 'injected') return 'injected';
  return connector.type.toLowerCase() === 'walletconnect' || connector.id?.toLowerCase() === 'walletconnect'
    ? 'walletConnect' : connector.type;
}

/** SDK errors must not prevent cleanup of the actual Wagmi connections. */
export async function closeWalletSessions(
  closeSdk: () => Promise<void>,
  closeConnections: () => Promise<void>,
  hasConnections: () => boolean,
) {
  let sdkFailed = false;
  try { await closeSdk(); } catch { sdkFailed = true; }
  let connectionsFailed = false;
  try { await closeConnections(); } catch { connectionsFailed = true; }
  // Core disconnect events can reconcile an SDK connector that was stale.
  if (sdkFailed) {
    try { await closeSdk(); sdkFailed = false; } catch { /* block below */ }
  }
  if (sdkFailed || connectionsFailed || hasConnections()) {
    throw new Error('The previous wallet session could not be fully closed. Retry connecting. No transaction was requested.');
  }
}

/**
 * Ask AppKit to close a real WalletConnect session only when one exists.
 * AppKit is the preferred owner; the Universal Provider is a fallback if the
 * adapter cannot close its own active session.
 */
export async function disconnectWalletConnectSession(
  getProvider: () => Promise<{ session?: unknown; disconnect: () => Promise<unknown> } | undefined>,
  disconnectAppKit: () => Promise<void>,
  hasWalletConnectConnection: () => boolean,
) {
  let provider: { session?: unknown; disconnect: () => Promise<unknown> } | undefined;
  try { provider = await getProvider(); }
  catch (error) {
    // A missing adapter is harmless when Wagmi has no active WalletConnect session.
    if (hasWalletConnectConnection()) throw error;
    return;
  }
  if (!provider?.session) return;
  try {
    await disconnectAppKit();
  } catch {
    await provider.disconnect();
    return;
  }
  if (provider.session) await provider.disconnect();
}
