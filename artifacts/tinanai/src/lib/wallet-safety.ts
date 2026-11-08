export function isSupportedWalletChain(chainId: number | null | undefined) {
  return chainId === 1 || chainId === 11155111;
}
// Closing AppKit need not resolve its pending relay promise. Never lock the
// header solely because that external connection attempt is still pending.
export function walletConnectionBusy(browserPending: boolean, status: string, modalOpen: boolean) {
  return browserPending || (status === 'connecting' && modalOpen);
}
export function walletErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && [4001, '4001'].includes(error.code as number)) {
    return 'You declined the wallet request. No transaction was sent.';
  }
  const message = error && typeof error === 'object' && 'shortMessage' in error
    ? String(error.shortMessage) : error instanceof Error ? error.message : 'Wallet request failed. Please try again.';
  return message.replace(/wc:[^\s]+/g, '[private pairing URI]').slice(0, 250);
}
