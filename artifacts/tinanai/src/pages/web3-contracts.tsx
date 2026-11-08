import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { formatUnits } from 'viem';
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Database, FileCode2, Layers, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, ErrorNote, Field, Input, PageHeader, Skeleton } from '@/components/kit';
import { networkName } from '@/components/wallet-control';
import { useContractDashboard } from '@/lib/use-web3-contracts';
import type { SupportedChain } from '@/lib/web3-contracts';
import { cn } from '@/lib/helpers';

const explorer = (chain: number) => chain === 1 ? 'https://etherscan.io' : 'https://sepolia.etherscan.io';
const fmt = (v: bigint, d: number) => {
  const [whole, fraction] = formatUnits(v, d).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
};

function Row({ k, v, id, mono = true }: { k: string; v: ReactNode; id: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{k}</dt><dd className={cn('mt-0.5 break-all text-xs', mono && 'font-mono')} data-testid={id}>{v}</dd></div>;
}

export default function Web3Contracts() {
  const d = useContractDashboard();
  const { chainId, config, snapshot, activity, wallet } = d;
  const [token, setToken] = useState('');
  const [core, setCore] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { document.title = 'Contracts dashboard · TINANAI'; document.querySelector('meta[name="description"]')?.setAttribute('content', 'Read-only status of TINAN Token and Core contracts from addresses you choose to observe.'); }, []);
  useEffect(() => { setToken(config?.tokenAddress ?? ''); setCore(config?.coreAddress ?? ''); }, [config?.tokenAddress, config?.coreAddress, chainId]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (d.saveAddresses(token, core)) { setSaved(true); setTimeout(() => setSaved(false), 1800); } };
  const snap = snapshot.isError ? undefined : snapshot.data;
  const live = Boolean(snap) && !snapshot.isRefetchError;
  const act = activity.isError ? undefined : activity.data;
  const ex = explorer(chainId);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8" data-testid="page-web3-contracts">
      <PageHeader eyebrow="Web3 · read-only" title="Contracts dashboard" desc="Live reads from addresses you choose to observe. No official Token/Core deployment is configured; nothing here registers or endorses a deployment." />

      <div role="note" className="mb-6 flex gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3.5 text-xs leading-relaxed text-amber-100/90" data-testid="text-deployment-notice">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p><strong>Deployment pending: no official TINAN Token or TinanAiCore address is configured.</strong> Values below appear only after a successful onchain read of the addresses you enter. EURIKA remains a separate ecosystem layer; see <Link href="/documents" className="text-primary underline-offset-2 hover:underline" data-testid="link-eurika-documents">EURIKA documents</Link>.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <Card>
            <form onSubmit={submit} className="space-y-4" aria-label="Observed contract addresses" noValidate>
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Observation settings</p><Badge tone="mute">This browser only</Badge></div>
              <fieldset>
                <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Network</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {([1, 11155111] as SupportedChain[]).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={chainId === c} onClick={() => d.setChainId(c)} data-testid={`button-chain-${c}`}
                      className={cn('h-10 rounded-md border text-sm font-semibold transition', chainId === c ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:text-foreground')}>
                      {c === 1 ? 'Ethereum' : 'Sepolia'}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="TINAN Token address"><Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x…" className="font-mono text-xs" spellCheck={false} data-testid="input-token-address" /></Field>
              <Field label="TinanAiCore address"><Input value={core} onChange={(e) => setCore(e.target.value)} placeholder="0x…" className="font-mono text-xs" spellCheck={false} data-testid="input-core-address" /></Field>
              {d.configError && <ErrorNote message={d.configError} />}
              <div className="flex gap-2">
                <Btn type="submit" variant="gold" className="flex-1" data-testid="button-save-addresses">{saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? 'Saved' : 'Save'}</Btn>
                <Btn type="button" variant="danger" onClick={() => { d.clearAddresses(); setToken(''); setCore(''); }} data-testid="button-clear-addresses"><Trash2 className="h-4 w-4" /> Clear</Btn>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Personal observation settings stored in this browser. Saving is not an official deployment registration.</p>
            </form>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold">Your wallet</p>
            {wallet.connected && wallet.account ? (
              <dl className="grid gap-3">
                <Row k="Account" v={wallet.account} id="text-dashboard-account" />
                <Row k="Wallet network" v={networkName(wallet.chainId)} id="text-dashboard-wallet-network" mono={false} />
                {wallet.chainId !== chainId && <p className="text-xs text-amber-300" data-testid="text-network-mismatch">Wallet is on a different network than the dashboard. Reads still use the selected {chainId === 1 ? 'Ethereum' : 'Sepolia'} RPC.</p>}
              </dl>
            ) : <p className="text-xs text-muted-foreground" data-testid="text-wallet-disconnected">Not connected. Contract reads work without a wallet; your token balance appears once connected.</p>}
          </Card>

          <nav className="grid gap-2 text-sm" aria-label="Related tools">
            {[['/launchpad/contracts', 'Legacy Contract Studio', FileCode2], ['/data-tokenization', 'Data tokenization studio', Database], ['/documents', 'EURIKA integration documents', Layers]].map(([href, label, Icon]) => {
              const I = Icon as typeof FileCode2;
              return <Link key={href as string} href={href as string} data-testid={`link-${(href as string).slice(1).replace(/\//g, '-')}`} className="flex items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3 transition hover:border-primary/50"><I className="h-4 w-4 text-primary" /><span className="flex-1">{label as string}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Link>;
            })}
          </nav>
        </div>

        <div className="min-w-0 space-y-6">
          <Card data-testid="card-contract-status">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="flex-1 text-sm font-semibold">Contract status · {networkName(chainId)}</p>
              {config && <Btn size="sm" onClick={d.refresh} disabled={snapshot.isFetching} data-testid="button-refresh"><RefreshCw className={cn('h-3.5 w-3.5', snapshot.isFetching && 'animate-spin')} /> Refresh</Btn>}
            </div>
            {!config ? (
              <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center" data-testid="status-no-config">
                <p className="font-semibold">No addresses observed on this network</p>
                <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">TINAN Token and Core are not deployed. If you have addresses to inspect, enter them to run read-only checks.</p>
              </div>
            ) : snapshot.isLoading ? <Skeleton lines={6} /> : snapshot.isError ? (
              <ErrorNote message={`Read failed: ${snapshot.error instanceof Error ? snapshot.error.message : 'unknown error'}. No contract values are shown.`} onRetry={d.refresh} />
            ) : snap && live ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {snap.verified ? <Badge tone="ok">Matches expected suite</Badge> : <Badge tone="mute">Mismatch</Badge>}
                  <Badge tone="mute">Block {snap.blockNumber.toString()}</Badge>
                  {snapshot.isFetching && <Badge tone="mute">Refreshing</Badge>}
                </div>
                {snap.problems.length > 0 && (
                  <ul className="space-y-1.5 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100" data-testid="list-mismatch">
                    {snap.problems.map((p) => <li key={p} className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />{p}</li>)}
                  </ul>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Row k="Token" v={`${snap.name} (${snap.symbol})`} id="text-token-name" mono={false} />
                  <Row k="Decimals" v={String(snap.decimals)} id="text-token-decimals" />
                  <Row k="Total supply" v={`${fmt(snap.totalSupply, snap.decimals)} ${snap.symbol}`} id="text-token-supply" />
                  <Row k="Your balance" v={snap.balance === null ? (wallet.account ? 'Unavailable' : 'Connect wallet') : `${fmt(snap.balance, snap.decimals)} ${snap.symbol}`} id="text-token-balance" />
                  <Row k="Core proofs" v={snap.proofCount.toString()} id="text-proof-count" />
                  <Row k="Checked" v={new Date(snap.checkedAt).toLocaleString()} id="text-checked-at" mono={false} />
                  <Row k="Core owner" v={snap.owner} id="text-core-owner" />
                  <Row k="Core linked token" v={snap.linkedToken} id="text-linked-token" />
                  <Row k="Source" v="Public RPC · read-only" id="text-source" mono={false} />
                </dl>
                <div className="grid gap-2 text-xs">
                  {[['Token', config.tokenAddress], ['Core', config.coreAddress]].map(([k, a]) => (
                    <a key={k} href={`${ex}/address/${a}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all font-mono text-primary hover:underline" data-testid={`link-explorer-${k.toLowerCase()}`}>{k}: {a}<ArrowUpRight className="h-3 w-3 shrink-0" /></a>
                  ))}
                </div>
              </div>
            ) : <Skeleton lines={4} />}
          </Card>

          <Card data-testid="card-activity">
            <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><p className="flex-1 text-sm font-semibold">Recent activity</p><Badge tone="mute">Last 500 blocks</Badge></div>
            {!config || !snap?.verified ? (
              <p className="text-xs text-muted-foreground" data-testid="status-activity-disabled">Activity is read only after both contracts verify against the expected suite.</p>
            ) : activity.isLoading ? <Skeleton lines={3} /> : activity.isError ? (
              <ErrorNote message="Activity could not be read. No events are shown." onRetry={() => void activity.refetch()} />
            ) : act ? (
              <>
                <p className="mb-3 text-[11px] text-muted-foreground" data-testid="text-activity-range">Blocks {act.fromBlock.toString()}–{act.toBlock.toString()}. Not a full history.</p>
                {act.partial && <p role="alert" className="mb-3 text-xs text-amber-300" data-testid="text-activity-partial">Some event queries failed; this list is incomplete.</p>}
                {act.items.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="status-activity-empty">No matching events in this window.</p> : (
                  <ul className="divide-y divide-border">
                    {act.items.map((i) => (
                      <li key={`${i.hash}:${i.logIndex}`} className="flex items-center gap-3 py-2 text-xs" data-testid={`row-activity-${i.hash}-${i.logIndex}`}>
                        <span className="w-28 shrink-0 font-semibold">{i.kind}</span>
                        <a href={`${ex}/tx/${i.hash}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-primary hover:underline">{i.hash}</a>
                        <span className="font-mono text-muted-foreground">#{i.blockNumber.toString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
