import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { erc20Abi, isAddress, type Address } from 'viem';
import { usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { ArrowUpRight, Coins, FileSignature, History, KeyRound, Network, Radar, RefreshCw, Send, ShieldCheck, Wallet } from 'lucide-react';
import {
  createTinanPaymentChallenge,
  createTinanPaymentInvoice,
  verifyTinanPaymentInvoice,
  type TinanPaymentCatalog,
  type TinanPaymentInvoice,
  type TinanPaymentService,
  type TinanWalletChallenge,
} from '@workspace/api-client-react';
import { Badge, Btn, Empty, ErrorNote, Field, Input, Modal, PageHeader, Skeleton } from '@/components/kit';
import { ConfirmationMeter, Notice, Panel, PaymentStatus, Stat, chainLabel, eur, explorer, fmtUnits, short } from '@/components/payment-ui';
import { MarketplaceRequests } from '@/components/payment-marketplace';
import { useWeb3Wallet } from '@/lib/web3-wallet';
import {
  apiError, clearLocalTx, isPolling, isTxHash, readLocalTx, saveLocalTx,
  useAuthedRequest, useInvalidatePayments, useOfficialToken, usePaymentAccount, usePaymentCatalog,
} from '@/lib/use-tinan-payments';
import { cn } from '@/lib/helpers';

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const expired = (i: TinanPaymentInvoice) => Date.parse(i.expiresAt) <= Date.now();
const rejected = (e: unknown) => /reject|denied|cancel/i.test(apiError(e)) || (e as { code?: number })?.code === 4001;

export default function Payments() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const catalog = usePaymentCatalog();
  const account = usePaymentAccount();
  const wallet = useWeb3Wallet();
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const [quoteFor, setQuoteFor] = useState<TinanPaymentService | null>(null);
  const [payInvoice, setPayInvoice] = useState<TinanPaymentInvoice | null>(null);
  const [recoverFor, setRecoverFor] = useState<TinanPaymentInvoice | null>(null);
  useEffect(() => { setQuoteFor(null); setPayInvoice(null); setRecoverFor(null); }, [userId]);

  useEffect(() => {
    document.title = 'Payments · TINANAI';
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'Pay for TINANAI services with server-verified TINAN token transfers. Quotes, wallet ownership proofs and confirmations in one place.');
  }, []);

  const cat = catalog.data;
  const s = cat?.settings;
  const token = useOfficialToken((s?.chainId ?? 11155111) as 1 | 11155111, s?.tokenAddress ?? null, wallet.account);
  const invoices = useMemo(() => account.data?.invoices ?? [], [account.data]);

  // Server-side verification polling: own invoices with a tx hash still in flight.
  const pollIds = invoices.filter(isPolling).map((i) => `${i.id}|${i.txHash}`).join(',');
  const authedRef = useRef(authed); authedRef.current = authed;
  const invalidateRef = useRef(invalidate); invalidateRef.current = invalidate;
  useEffect(() => {
    if (!pollIds) return;
    const tick = async () => {
      for (const pair of pollIds.split(',')) {
        const [id, txHash] = pair.split('|');
        try { await verifyTinanPaymentInvoice(id, { txHash }, await authedRef.current()); } catch { /* surfaced via invoice.error on refresh */ }
      }
      invalidateRef.current();
    };
    const t = setInterval(() => void tick(), 15_000);
    return () => clearInterval(t);
  }, [pollIds]);

  const credit = (slug: string) => account.data?.credits.find((c) => c.serviceSlug === slug)?.available ?? 0;
  const tinanPerEur = s?.tinanPerEur ? Number(s.tinanPerEur) : null;

  return (
    <div className="mx-auto w-full max-w-6xl" data-testid="page-payments">
      <PageHeader
        eyebrow="Payments · TINAN"
        title="Service access, settled onchain"
        desc="Every paid credit here traces to a TINAN transfer the server verified on the configured network. Nothing activates from the browser alone."
        action={account.data?.isAdmin ? <Link href="/payments/admin" data-testid="link-payment-admin" className="inline-flex h-10 items-center gap-2 rounded-md border border-primary/50 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10"><KeyRound className="h-4 w-4" />Administration</Link> : undefined}
      />

      {catalog.isLoading ? <Panel title="Loading payment catalog"><Skeleton lines={5} /></Panel>
        : catalog.isError || !cat || !s ? <ErrorNote message={`The payment catalog could not be loaded: ${apiError(catalog.error)}`} onRetry={() => void catalog.refetch()} />
        : (
          <div className="space-y-6">
            <ReadinessBanner cat={cat} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <Panel eyebrow="Official configuration" title="Configured TINAN token" id="panel-token"
                action={s.tokenAddress && <Btn size="sm" onClick={() => void token.refetch()} disabled={token.isFetching} data-testid="button-refresh-token"><RefreshCw className={cn('h-3.5 w-3.5', token.isFetching && 'animate-spin')} />Refresh</Btn>}>
                {!s.tokenAddress ? (
                  <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center" data-testid="status-token-unconfigured">
                    <Coins className="mx-auto mb-3 h-6 w-6 text-primary/70" />
                    <p className="font-semibold">No official token address configured</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">No token is configured for payments yet. No name, supply or balance is shown until an administrator configures an address and it reads successfully onchain.</p>
                  </div>
                ) : token.isLoading ? <Skeleton lines={5} /> : token.isError ? (
                  <ErrorNote message={`RPC read failed for ${chainLabel(s.chainId)}: ${apiError(token.error)}. No token values are shown.`} onRetry={() => void token.refetch()} />
                ) : token.data && !token.data.hasCode ? (
                  <Notice tone="danger" id="status-token-no-code">No contract code exists at the configured address on {chainLabel(s.chainId)}. Payments cannot proceed until this is corrected.</Notice>
                ) : token.data ? (
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                    <Stat k="Token" v={`${token.data.name} (${token.data.symbol})`} id="text-token-name" mono={false} />
                    <Stat k="Decimals" v={token.data.decimals} id="text-token-decimals" />
                    <Stat k="Total supply" v={fmtUnits(token.data.totalSupply, token.data.decimals, 2)} id="text-token-supply" />
                    <Stat k="Your balance" v={token.data.balance === null ? 'Connect wallet' : `${fmtUnits(token.data.balance, token.data.decimals)} ${token.data.symbol}`} id="text-token-balance" />
                    <Stat k="Code check" v={<Badge tone="ok">Contract code present</Badge>} id="text-token-code" mono={false} />
                    <Stat k="Read at block" v={token.data.blockNumber.toString()} id="text-token-block" />
                  </dl>
                ) : null}
                <div className="mt-5 grid gap-2 border-t border-border/70 pt-4 text-xs">
                  <AddressLine label="Token" value={s.tokenAddress} chain={s.chainId} id="token" />
                  <AddressLine label="Treasury" value={s.treasuryAddress} chain={s.chainId} id="treasury" />
                </div>
                <p className="mt-4 text-[11px] text-muted-foreground">Want to inspect addresses of your own? The <Link href="/contracts" className="text-primary hover:underline" data-testid="link-contracts">personal Token/Core observer</Link> stays separate and is never treated as official.</p>
              </Panel>

              <Panel eyebrow="Network" title="Supported networks" id="panel-network">
                <ul className="space-y-2">
                  {([1, 11155111] as const).map((c) => (
                    <li key={c} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm', s.chainId === c ? 'border-primary/50 bg-primary/5' : 'border-border')} data-testid={`row-network-${c}`}>
                      <Network className={cn('h-4 w-4', s.chainId === c ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="flex-1">{chainLabel(c)}</span>
                      {s.chainId === c ? <Badge>Payment network</Badge> : <Badge tone="mute">Supported</Badge>}
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <Stat k="Confirmations" v={s.confirmations} id="text-required-confirmations" />
                  <Stat k="Payments" v={s.enabled ? 'Enabled' : 'Disabled'} id="text-payments-enabled" mono={false} />
                  <Stat k="TINAN per EUR" v={s.tinanPerEur ?? 'Not set'} id="text-rate" hint={cat.rateKind === 'administrator-set' ? 'Administrator-set rate' : undefined} />
                  <Stat k="Rate source" v={s.rateSource || 'Not stated'} id="text-rate-source" mono={false} />
                </dl>
                <div className="mt-4 rounded-lg border border-border bg-background/40 p-3 text-xs" data-testid="text-wallet-status">
                  <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /><span className="font-semibold">Your wallet</span></div>
                  {!wallet.connected ? (
                    <div className="mt-2 flex items-center justify-between gap-2"><span className="text-muted-foreground">Not connected</span><Btn size="sm" variant="gold" onClick={() => void wallet.connectWallet()} disabled={wallet.connecting} data-testid="button-connect-wallet">Connect</Btn></div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="font-mono text-muted-foreground">{short(wallet.account)} · {chainLabel(wallet.chainId ?? 0)}</p>
                      {wallet.chainId !== s.chainId && <Btn size="sm" onClick={() => void wallet.switchNetwork(s.chainId)} data-testid="button-switch-network">Switch to {chainLabel(s.chainId)}</Btn>}
                    </div>
                  )}
                  {wallet.error && <p className="mt-2 text-rose-300">{wallet.error}</p>}
                </div>
              </Panel>
            </div>

            <Panel eyebrow="Catalog" title="Services and credits" id="panel-services">
              {!isSignedIn && isLoaded && <div className="mb-4"><Notice tone="info" id="status-signed-out"><Link href="/sign-in" className="font-semibold text-primary hover:underline">Sign in</Link> to see your credits, create quotes and review your payment history.</Notice></div>}
              <div className="grid gap-3 md:grid-cols-2">
                {cat.services.map((svc) => {
                  const est = svc.eurCents != null && tinanPerEur != null && Number.isFinite(tinanPerEur) ? (svc.eurCents / 100) * tinanPerEur : null;
                  const canQuote = isSignedIn && cat.ready && s.enabled && svc.enabled && svc.requiresPayment && svc.eurCents != null;
                  return (
                    <article key={svc.slug} data-testid={`card-service-${svc.slug}`} className="group flex flex-col rounded-xl border border-border bg-background/35 p-4 transition hover:border-primary/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold">{svc.name}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{svc.description || 'No description set.'}{svc.slug === 'marketplace' && ' Each payment buys one manual fulfillment request reviewed by an administrator.'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-lg font-semibold text-foreground" data-testid={`text-price-${svc.slug}`}>{eur(svc.eurCents)}</p>
                          {est != null && <p className="font-mono text-[10px] text-muted-foreground" title="Estimate only, not a quote">~{est.toLocaleString(undefined, { maximumFractionDigits: 4 })} TINAN est.</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {!svc.enabled ? <Badge tone="mute">Disabled</Badge> : svc.requiresPayment ? <Badge>Requires payment</Badge> : <Badge tone="ok">Free, not purchasable</Badge>}
                        {isSignedIn && <span data-testid={`text-credits-${svc.slug}`}><Badge tone={credit(svc.slug) > 0 ? 'ok' : 'mute'}>{credit(svc.slug)} credit{credit(svc.slug) === 1 ? '' : 's'}</Badge></span>}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <Link href={svc.route} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" data-testid={`link-service-${svc.slug}`}>Open <ArrowUpRight className="h-3 w-3" /></Link>
                        <Btn size="sm" variant="gold" disabled={!canQuote} onClick={() => setQuoteFor(svc)} data-testid={`button-quote-${svc.slug}`}><FileSignature className="h-3.5 w-3.5" />Create quote</Btn>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">EUR prices are set by an administrator. TINAN figures beside them are estimates from the administrator-set rate, not quotes. A binding amount exists only inside a server-issued invoice. Marketplace payments buy one manual fulfillment request, not an automatic asset purchase. Free services cannot be bought.</p>
            </Panel>

            {isSignedIn && <MarketplaceRequests credits={credit('marketplace')} />}

            <Panel eyebrow="Your account" title="Payment history" id="panel-history"
              action={isSignedIn && <Btn size="sm" onClick={() => void account.refetch()} disabled={account.isFetching} data-testid="button-refresh-history"><RefreshCw className={cn('h-3.5 w-3.5', account.isFetching && 'animate-spin')} />Refresh</Btn>}>
              {!isSignedIn ? <Empty icon={<History className="h-5 w-5" />} title="Sign in to view history" desc="Invoices are private to your account and never shown without login." />
                : account.isLoading ? <Skeleton lines={5} />
                : account.isError ? <ErrorNote message={`History unavailable: ${apiError(account.error)}`} onRetry={() => void account.refetch()} />
                : invoices.length === 0 ? <Empty icon={<Radar className="h-5 w-5" />} title="No invoices yet" desc="Create a quote from a service above. Your quotes and verified transfers appear here." />
                : (
                  <ul className="space-y-3">
                    {invoices.map((inv) => {
                      const local = userId ? readLocalTx(userId, inv.id) : null;
                      const hash = inv.txHash ?? local;
                      const payable = inv.status === 'created' && !expired(inv) && !inv.txHash;
                      return (
                        <li key={inv.id} data-testid={`row-invoice-${inv.id}`} className="rounded-xl border border-border bg-background/30 p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{inv.serviceName}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{new Date(inv.createdAt).toLocaleString()} · {chainLabel(inv.chainId)}</p>
                            </div>
                            <div className="text-right font-mono text-sm"><p>{inv.amountTinan} TINAN</p><p className="text-[11px] text-muted-foreground">{eur(inv.eurCents)}</p></div>
                            <PaymentStatus status={inv.status === 'created' && expired(inv) ? 'expired' : inv.status} id={inv.id} />
                          </div>
                          {(inv.status === 'pending' || inv.status === 'confirming') && <div className="mt-3"><ConfirmationMeter invoice={inv} /></div>}
                          {inv.error && <p className="mt-2 text-xs text-rose-300" data-testid={`text-invoice-error-${inv.id}`}>{inv.error}</p>}
                          {hash && (
                            <a href={`${explorer(inv.chainId)}/tx/${hash}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 truncate font-mono text-[11px] text-primary hover:underline" data-testid={`link-tx-${inv.id}`}>
                              {short(hash, 10)}{!inv.txHash && ' (saved locally, not yet verified)'}<ArrowUpRight className="h-3 w-3 shrink-0" />
                            </a>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {payable && !local && <Btn size="sm" variant="gold" onClick={() => setPayInvoice(inv)} data-testid={`button-pay-${inv.id}`}><Send className="h-3.5 w-3.5" />Review and pay</Btn>}
                            {(inv.status === 'created' || inv.status === 'expired') && !inv.txHash && <Btn size="sm" onClick={() => setRecoverFor(inv)} data-testid={`button-recover-${inv.id}`}>{local ? 'Submit saved hash' : 'I already sent it'}</Btn>}
                            {inv.status === 'confirmed' && <Badge tone="ok">One service credit granted</Badge>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              {invoices.some(isPolling) && <p className="mt-3 text-[11px] text-muted-foreground" data-testid="text-polling">Checking pending transfers every 15 seconds while this page is open. The server also reconciles submitted transfers about every 30 seconds, so you can close the browser.</p>}
            </Panel>
          </div>
        )}

      {quoteFor && cat && <QuoteDialog service={quoteFor} catalog={cat} onClose={() => setQuoteFor(null)} onCreated={(inv) => { setQuoteFor(null); setPayInvoice(inv); }} />}
      {payInvoice && <PayDialog invoice={payInvoice} onClose={() => setPayInvoice(null)} />}
      {recoverFor && <RecoverDialog invoice={recoverFor} onClose={() => setRecoverFor(null)} />}
    </div>
  );
}

function ReadinessBanner({ cat }: { cat: TinanPaymentCatalog }) {
  if (cat.ready && cat.settings.enabled) return <Notice tone="ok" id="status-payments-ready">Payments are live on {chainLabel(cat.settings.chainId)}. Credits are added only after {cat.settings.confirmations} server-verified confirmations.</Notice>;
  return (
    <Notice tone="warn" id="status-payments-unavailable">
      <strong>Payments are not active.</strong> {cat.reason ?? 'The TINAN payment configuration is incomplete.'} Checkout stays disabled until an administrator configures payments and the exact token is verified onchain. This page does not state whether a token exists elsewhere. Existing free features keep working unchanged.
    </Notice>
  );
}

function AddressLine({ label, value, chain, id }: { label: string; value: string | null; chain: number; id: string }) {
  return (
    <div className="flex items-center gap-2" data-testid={`text-${id}-address`}>
      <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</span>
      {value ? <a href={`${explorer(chain)}/address/${value}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 break-all font-mono text-primary hover:underline">{value}<ArrowUpRight className="h-3 w-3 shrink-0" /></a> : <span className="text-muted-foreground">Not configured</span>}
    </div>
  );
}

function QuoteDialog({ service, catalog, onClose, onCreated }: { service: TinanPaymentService; catalog: TinanPaymentCatalog; onClose: () => void; onCreated: (i: TinanPaymentInvoice) => void }) {
  const wallet = useWeb3Wallet();
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const { signMessageAsync } = useSignMessage();
  const [challenge, setChallenge] = useState<(TinanWalletChallenge & { payer: string }) | null>(null);
  const [busy, setBusy] = useState<'challenge' | 'sign' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chain = catalog.settings.chainId;
  const walletOk = wallet.connected && wallet.account && wallet.chainId === chain;

  useEffect(() => { if (challenge && !same(challenge.payer, wallet.account)) { setChallenge(null); setError('Wallet account changed. Request a new challenge for the connected account.'); } }, [wallet.account, challenge]);

  const requestChallenge = async () => {
    if (!wallet.account) return;
    setBusy('challenge'); setError(null);
    try { const c = await createTinanPaymentChallenge({ payer: wallet.account }, await authed()); setChallenge({ ...c, payer: wallet.account }); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  const signAndQuote = async () => {
    if (!challenge) return;
    if (!same(challenge.payer, wallet.account) || wallet.chainId !== chain) { setError('Wallet account or network changed. Reconnect the original account on the payment network.'); return; }
    if (Date.parse(challenge.expiresAt) <= Date.now()) { setChallenge(null); setError('Challenge expired. Request a new one.'); return; }
    setBusy('sign'); setError(null);
    try {
      const signature = await signMessageAsync({ account: challenge.payer as Address, message: challenge.message });
      const inv = await createTinanPaymentInvoice({ serviceSlug: service.slug, challengeId: challenge.id, signature }, await authed());
      invalidate();
      onCreated(inv);
    } catch (e) { setError(rejected(e) ? 'Signature request was rejected in your wallet. No quote was created.' : apiError(e)); }
    finally { setBusy(null); }
  };

  return (
    <Modal open onClose={onClose} title="Create a quote">
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="font-semibold">{service.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{eur(service.eurCents)} · {chainLabel(chain)}</p>
        </div>
        <Notice tone="info">Step 1 proves you control the wallet that will pay. You sign a plain text message from the server. <strong>Signing spends no funds and sends no transaction.</strong> The server then issues an invoice with a fixed TINAN amount.</Notice>
        {!wallet.connected ? <Btn variant="gold" className="w-full" onClick={() => void wallet.connectWallet()} data-testid="button-quote-connect"><Wallet className="h-4 w-4" />Connect wallet</Btn>
          : wallet.chainId !== chain ? <Btn variant="gold" className="w-full" onClick={() => void wallet.switchNetwork(chain)} data-testid="button-quote-switch">Switch to {chainLabel(chain)}</Btn>
          : !challenge ? <Btn variant="gold" className="w-full" disabled={busy !== null || !walletOk} onClick={() => void requestChallenge()} data-testid="button-request-challenge">{busy === 'challenge' ? 'Requesting…' : `Request ownership challenge for ${short(wallet.account)}`}</Btn>
          : (
            <>
              <Field label="Message you will sign"><pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background/60 p-3 font-mono text-[11px]" data-testid="text-challenge-message">{challenge.message}</pre></Field>
              <Btn variant="gold" className="w-full" disabled={busy !== null} onClick={() => void signAndQuote()} data-testid="button-sign-challenge"><FileSignature className="h-4 w-4" />{busy === 'sign' ? 'Waiting for wallet…' : 'Sign message and create quote'}</Btn>
            </>
          )}
        {error && <ErrorNote message={error} />}
        <p className="text-[11px] text-muted-foreground">Sending TINAN is a separate step after you review the quote.</p>
      </div>
    </Modal>
  );
}

type Preflight = { account: string; chainId: number; balance: bigint; decimals: number; symbol: string; gas: bigint; fee: bigint; native: bigint };

function PayDialog({ invoice, onClose }: { invoice: TinanPaymentInvoice; onClose: () => void }) {
  const { userId } = useAuth();
  const wallet = useWeb3Wallet();
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const client = usePublicClient({ chainId: invoice.chainId as 1 | 11155111 });
  const { writeContractAsync } = useWriteContract();
  const [pre, setPre] = useState<Preflight | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'sending' | 'verifying' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sentHash, setSentHash] = useState<string | null>(null);
  const sendLock = useRef(false);
  const amount = BigInt(invoice.amountAtomic);

  useEffect(() => { if (pre && (!same(pre.account, wallet.account) || pre.chainId !== wallet.chainId)) { setPre(null); setError('Wallet account or network changed. Run the checks again.'); } }, [wallet.account, wallet.chainId, pre]);

  const problems = (): string | null => {
    if (!wallet.connected || !wallet.account) return 'Connect your wallet.';
    if (!same(wallet.account, invoice.payer)) return `Connected account ${short(wallet.account)} does not match the invoice payer ${short(invoice.payer)}.`;
    if (wallet.chainId !== invoice.chainId) return `Switch your wallet to ${chainLabel(invoice.chainId)}.`;
    if (invoice.status !== 'created') return 'This invoice is no longer awaiting payment.';
    if (expired(invoice)) return 'This quote has expired. Create a new quote.';
    if (!isAddress(invoice.tokenAddress) || !isAddress(invoice.treasuryAddress)) return 'Invoice addresses are invalid.';
    if (!client) return 'RPC unavailable for this network.';
    return null;
  };

  const check = async () => {
    const p = problems(); if (p) { setError(p); return; }
    setPhase('checking'); setError(null); setPre(null);
    try {
      const account = wallet.account as Address;
      const token = invoice.tokenAddress as Address;
      const c = client!;
      const [balance, decimals, symbol, native] = await Promise.all([
        c.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
        c.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
        c.getBalance({ address: account }),
      ]);
      if (balance < amount) throw new Error(`Insufficient ${symbol}: you hold ${fmtUnits(balance, decimals)}, the invoice requires ${invoice.amountTinan}.`);
      const args = [invoice.treasuryAddress as Address, amount] as const;
      await c.simulateContract({ address: token, abi: erc20Abi, functionName: 'transfer', args, account });
      const gas = await c.estimateContractGas({ address: token, abi: erc20Abi, functionName: 'transfer', args, account });
      const fees = await c.estimateFeesPerGas().catch(() => null);
      const price = fees?.maxFeePerGas ?? (await c.getGasPrice());
      const fee = gas * price;
      if (native < fee) throw new Error(`Insufficient ETH for gas: about ${fmtUnits(fee, 18, 8)} ETH needed, wallet holds ${fmtUnits(native, 18, 8)} ETH.`);
      setPre({ account, chainId: invoice.chainId, balance, decimals, symbol, gas, fee, native });
    } catch (e) { setError(`Pre-flight failed: ${apiError(e)}`); }
    finally { setPhase('idle'); }
  };

  // Only this explicit confirmation handler broadcasts a transfer.
  const confirmSend = async () => {
    if (sendLock.current) return;
    const p = problems(); if (p || !pre || !userId) { setError(p ?? 'Run the checks first.'); return; }
    if (!same(pre.account, wallet.account) || pre.chainId !== wallet.chainId) { setPre(null); setError('Wallet changed since checks. Run them again.'); return; }
    // Final re-check right before broadcast: wallet, network, quote expiry.
    if (!same(pre.account, wallet.account) || wallet.chainId !== invoice.chainId || expired(invoice) || invoice.status !== 'created') {
      setPre(null); setError('Wallet, network or quote changed. Run the checks again.'); return;
    }
    sendLock.current = true;
    setPhase('sending'); setError(null);
    let hash: string;
    try {
      hash = await writeContractAsync({ address: invoice.tokenAddress as Address, abi: erc20Abi, functionName: 'transfer', args: [invoice.treasuryAddress as Address, amount], chainId: invoice.chainId as 1 | 11155111, account: pre.account as Address });
    } catch (e) { sendLock.current = false; setPhase('idle'); setError(rejected(e) ? 'Transfer rejected in your wallet. Nothing was sent.' : apiError(e)); return; }
    const savedLocally = saveLocalTx(userId, invoice.id, hash);
    setSentHash(hash); setPhase('verifying');
    try { await verifyTinanPaymentInvoice(invoice.id, { txHash: hash }, await authed()); setPhase('done'); }
    catch (e) { setPhase('done'); setError(`Transfer broadcast, but the server has not accepted the hash yet: ${apiError(e)}. ${savedLocally ? 'It is saved in this browser; use "Submit saved hash" to retry.' : `Browser storage is unavailable. Copy this hash now for recovery: ${hash}`}`); }
    invalidate();
  };

  return (
    <Modal open onClose={onClose} title="Review and pay" wide>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-3">
          <Stat k="Service" v={invoice.serviceName} id="text-pay-service" mono={false} />
          <Stat k="Amount" v={`${invoice.amountTinan} TINAN`} id="text-pay-amount" />
          <Stat k="EUR" v={eur(invoice.eurCents)} id="text-pay-eur" />
          <Stat k="Rate" v={`${invoice.tinanPerEur} / EUR`} id="text-pay-rate" hint={invoice.rateSource} />
          <Stat k="Network" v={chainLabel(invoice.chainId)} id="text-pay-chain" mono={false} />
          <Stat k="Expires" v={new Date(invoice.expiresAt).toLocaleString()} id="text-pay-expires" mono={false} />
          <Stat k="Payer" v={invoice.payer} id="text-pay-payer" />
          <Stat k="Token" v={invoice.tokenAddress} id="text-pay-token" />
          <Stat k="Treasury" v={invoice.treasuryAddress} id="text-pay-treasury" />
        </dl>
        <Notice tone="warn">This is a direct ERC20 <code>transfer</code> of exactly {invoice.amountAtomic} atomic units to the treasury. No approval, no allowance, no ETH value. Your wallet still needs native ETH to pay network gas.</Notice>
        {phase === 'done' && sentHash ? (
          <Notice tone="ok" id="status-pay-sent">Transfer submitted: <a className="font-mono underline" href={`${explorer(invoice.chainId)}/tx/${sentHash}`} target="_blank" rel="noreferrer">{short(sentHash, 10)}</a>. The server confirms it after {invoice.requiredConfirmations} confirmations and then adds one credit. The server keeps reconciling it even if you close the browser.</Notice>
        ) : (
          <>
            {pre && (
              <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-background/40 p-4 sm:grid-cols-4" data-testid="panel-preflight">
                <Stat k="Token balance" v={`${fmtUnits(pre.balance, pre.decimals)} ${pre.symbol}`} id="text-pre-balance" />
                <Stat k="Gas limit" v={pre.gas.toString()} id="text-pre-gas" />
                <Stat k="Est. max fee" v={`${fmtUnits(pre.fee, 18, 8)} ETH`} id="text-pre-fee" />
                <Stat k="ETH balance" v={`${fmtUnits(pre.native, 18, 6)} ETH`} id="text-pre-native" />
              </dl>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Btn className="flex-1" onClick={() => void check()} disabled={phase !== 'idle'} data-testid="button-preflight"><ShieldCheck className="h-4 w-4" />{phase === 'checking' ? 'Checking…' : pre ? 'Re-run checks' : 'Run pre-flight checks'}</Btn>
              <Btn variant="gold" className="flex-1" onClick={() => void confirmSend()} disabled={!pre || phase !== 'idle'} data-testid="button-confirm-send"><Send className="h-4 w-4" />{phase === 'sending' ? 'Confirm in wallet…' : phase === 'verifying' ? 'Submitting hash…' : `Send ${invoice.amountTinan} TINAN`}</Btn>
            </div>
          </>
        )}
        {error && <ErrorNote message={error} />}
        {userId && phase === 'done' && !error && <button className="text-[11px] text-muted-foreground underline" onClick={() => clearLocalTx(userId, invoice.id)} data-testid="button-forget-local">Forget locally saved hash</button>}
      </div>
    </Modal>
  );
}

function RecoverDialog({ invoice, onClose }: { invoice: TinanPaymentInvoice; onClose: () => void }) {
  const { userId } = useAuth();
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const [hash, setHash] = useState(() => (userId ? readLocalTx(userId, invoice.id) : null) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TinanPaymentInvoice | null>(null);
  const submit = async () => {
    const h = hash.trim();
    if (!isTxHash(h)) { setError('Enter a 0x-prefixed 64 character transaction hash.'); return; }
    if (userId) saveLocalTx(userId, invoice.id, h);
    setBusy(true); setError(null);
    try { setResult(await verifyTinanPaymentInvoice(invoice.id, { txHash: h }, await authed())); invalidate(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Recover a transfer">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">If you already sent the exact amount for <strong className="text-foreground">{invoice.serviceName}</strong> but the hash never reached the server, paste it here. The server verifies sender, token, treasury, amount and confirmations.</p>
        <Field label="Transaction hash"><Input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x…" className="font-mono text-xs" spellCheck={false} data-testid="input-recover-hash" /></Field>
        {result && <div className="flex items-center gap-2"><PaymentStatus status={result.status} />{result.error && <span className="text-xs text-rose-300">{result.error}</span>}</div>}
        {error && <ErrorNote message={error} />}
        <Btn variant="gold" className="w-full" onClick={() => void submit()} disabled={busy} data-testid="button-submit-recover">{busy ? 'Verifying…' : 'Submit for server verification'}</Btn>
      </div>
    </Modal>
  );
}
