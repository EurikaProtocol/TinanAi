import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { Check, ChevronDown, Copy, Globe, LogOut, QrCode, Wallet } from 'lucide-react';
import { Btn } from '@/components/kit';
import { cn, copyText } from '@/lib/helpers';
import { useWeb3Wallet } from '@/lib/web3-wallet';

const NETWORKS: { id: 1 | 11155111; name: string }[] = [{ id: 1, name: 'Ethereum' }, { id: 11155111, name: 'Sepolia' }];
export const networkName = (id: number | null) => id === 1 ? 'Ethereum Mainnet' : id === 11155111 ? 'Sepolia testnet' : id ? `Unsupported chain ${id}` : 'No network';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletControl({ className, autoOpen = false }: { className?: string; autoOpen?: boolean }) {
  const w = useWeb3Wallet();
  const [open, setOpen] = useState(autoOpen);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);

  const balanceText = !w.supported ? 'Unavailable on this network'
    : w.balanceLoading ? 'Reading…'
    : w.balanceError || !w.balance ? 'Unavailable'
    : `${formatUnits(w.balance.value, w.balance.decimals)} ${w.balance.symbol}`;

  return (
    <div ref={ref} className={cn('relative', className)}>
      {w.connected && w.account ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" data-testid="button-wallet-menu"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background/60 px-3 text-xs font-semibold transition hover:border-primary/60">
          <span className={cn('h-2 w-2 rounded-full', w.supported ? 'bg-emerald-400' : 'bg-amber-400')} aria-hidden />
          <span className="font-mono" data-testid="text-wallet-short">{short(w.account)}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      ) : (
        <Btn size="sm" variant="gold" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" disabled={w.connecting} data-testid="button-connect-wallet">
          <Wallet className="h-3.5 w-3.5" /> {w.connecting ? 'Connecting…' : 'Connect Wallet'}
        </Btn>
      )}

      {open && (
        <div role="dialog" aria-label="Wallet" data-testid="panel-wallet"
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-popover-border bg-popover p-4 shadow-[0_24px_60px_rgba(0,0,0,.45)] animate-in fade-in slide-in-from-top-1 duration-150">
          {w.connected && w.account ? (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Connected account</p>
                <div className="mt-1.5 flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-xs" data-testid="text-wallet-address">{w.account}</p>
                  <button type="button" aria-label="Copy address" data-testid="button-copy-address" className="rounded p-1 text-muted-foreground hover:text-primary"
                    onClick={async () => { await copyText(w.account!); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Connector</dt><dd className="mt-0.5 font-mono" data-testid="text-wallet-connector">{w.connectorType ?? 'Unknown'}</dd></div>
                <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Network</dt>
                  <dd className={cn('mt-0.5 font-semibold', !w.supported && 'text-amber-300')} data-testid="text-wallet-network">{networkName(w.chainId)}</dd></div>
                <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Native balance</dt>
                  <dd className="mt-0.5 break-all font-mono" data-testid="text-wallet-balance">{balanceText}</dd></div>
              </dl>
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Switch network</p>
                <div className="grid grid-cols-2 gap-2">
                  {NETWORKS.map((n) => (
                    <Btn key={n.id} size="sm" variant={w.chainId === n.id ? 'gold' : 'outline'} aria-pressed={w.chainId === n.id} disabled={w.chainId === n.id}
                      onClick={() => void w.switchNetwork(n.id)} data-testid={`button-switch-${n.id}`}><Globe className="h-3.5 w-3.5" /> {n.name}</Btn>
                  ))}
                </div>
              </div>
              {w.error && <p role="alert" className="text-xs text-destructive" data-testid="text-wallet-error">{w.error}</p>}
              <Btn size="sm" variant="danger" className="w-full" onClick={() => { void w.disconnect(); setOpen(false); }} data-testid="button-disconnect-wallet"><LogOut className="h-3.5 w-3.5" /> Disconnect</Btn>
              <Btn size="sm" className="w-full" disabled={w.connecting || !w.walletConnectAvailable} onClick={() => void w.connectWalletConnect()} data-testid="button-reconnect-walletconnect"><QrCode className="h-3.5 w-3.5" /> Change wallet (WalletConnect)</Btn>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Read-only connection. TINANAI never requests signatures or transactions from this menu.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-sm font-semibold">Connect a wallet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">Used to read your address, network and balance. No signing or transactions.</p>
              <Btn size="sm" variant="gold" className="w-full justify-start" onClick={() => void w.connectInjected()} disabled={w.connecting} data-testid="button-connect-browser"><Wallet className="h-3.5 w-3.5" /> Browser wallet</Btn>
              <Btn size="sm" className="w-full justify-start" onClick={() => void w.connectWalletConnect()} disabled={w.connecting || !w.walletConnectAvailable} data-testid="button-connect-walletconnect"><QrCode className="h-3.5 w-3.5" /> Mobile wallet (WalletConnect)</Btn>
              {!w.walletConnectAvailable && <p className="text-[11px] text-muted-foreground" data-testid="text-walletconnect-unavailable">WalletConnect is unavailable until a Reown project ID is configured.</p>}
              {w.walletConnectAvailable && <p className="text-[11px] text-muted-foreground">Choose WalletConnect or Coinbase Wallet in the wallet picker. Mobile wallets may offer an app link instead of a QR.</p>}
              {w.error && <p role="alert" className="text-xs text-destructive" data-testid="text-wallet-error">{w.error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
