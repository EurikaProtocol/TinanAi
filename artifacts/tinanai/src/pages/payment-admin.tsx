import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { isAddress } from 'viem';
import { ArrowLeft, Download, Lock, RefreshCw, Save, Search } from 'lucide-react';
import {
  exportTinanPayments,
  initializeTinanPayments,
  updateTinanPaymentAdmin,
  type TinanPaymentInvoiceStatus,
  type TinanPaymentService,
  type TinanPaymentSettings,
} from '@workspace/api-client-react';
import { Badge, Btn, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from '@/components/kit';
import { MarketplaceAdmin } from '@/components/payment-marketplace';
import { MainnetDeploymentAdmin } from '@/components/mainnet-preparation';
import { Notice, Panel, PaymentStatus, chainLabel, eur, explorer, short } from '@/components/payment-ui';
import { apiError, useAuthedRequest, useInvalidatePayments, usePaymentAccount, usePaymentAdmin } from '@/lib/use-tinan-payments';
import { cn } from '@/lib/helpers';
import { MIN_CONFIRMATIONS, MAX_CONFIRMATIONS, confirmationsError } from '@/lib/payment-readiness';

type ServiceDraft = Omit<TinanPaymentService, 'eurCents'> & { price: string };
const STATUSES: (TinanPaymentInvoiceStatus | 'all')[] = ['all', 'created', 'pending', 'confirming', 'confirmed', 'failed', 'expired'];

function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} data-testid={id}
      className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition', checked ? 'border-primary/60 bg-primary/10 text-primary' : 'border-input text-muted-foreground')}>
      <span className={cn('h-2 w-2 rounded-full', checked ? 'bg-primary' : 'bg-muted-foreground/50')} />{label}
    </button>
  );
}

export default function PaymentAdmin() {
  const { isLoaded, isSignedIn } = useAuth();
  const account = usePaymentAccount();
  const admin = usePaymentAdmin(Boolean(isSignedIn && account.data?.isAdmin));
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const [settings, setSettings] = useState<TinanPaymentSettings | null>(null);
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [initRev, setInitRev] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TinanPaymentInvoiceStatus | 'all'>('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationApproved, setInitializationApproved] = useState(false);
  async function initializeMissingRecords() {
    if (!initializationApproved || initializing) return;
    setInitializing(true); setInitializationError(null);
    try {
      await initializeTinanPayments(await authed());
      invalidate();
      await admin.refetch();
    } catch (error) { setInitializationError(apiError(error)); }
    finally { setInitializing(false); }
  }

  useEffect(() => {
    document.title = 'Payment administration · TINANAI';
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'Configure TINAN payment settings, service prices and review payments.');
  }, []);

  const cat = admin.data?.catalog;
  useEffect(() => {
    if (cat && initRev !== cat.settings.revision) {
      setInitRev(cat.settings.revision);
      setSettings(cat.settings);
      setServices(cat.services.map(({ eurCents, ...s }) => ({ ...s, price: eurCents == null ? '' : (eurCents / 100).toFixed(2) })));
    }
  }, [cat, initRev]);

  const [confirmEnable, setConfirmEnable] = useState(false);
  const validation = useMemo(() => {
    if (!settings) return null;
    if (settings.tokenAddress && !isAddress(settings.tokenAddress)) return 'Token address is not a valid address.';
    if (settings.treasuryAddress && !isAddress(settings.treasuryAddress)) return 'Treasury address is not a valid address.';
    if (settings.tinanPerEur && !/^\d+(\.\d+)?$/.test(settings.tinanPerEur)) return 'TINAN per EUR must be a positive decimal.';
    const ce = confirmationsError(settings.confirmations, chainLabel(settings.chainId)); if (ce) return ce;
    for (const s of services) {
      if (!s.name.trim()) return 'Every service needs a name.';
      if (s.price && !/^\d+(\.\d{1,2})?$/.test(s.price)) return `Price for ${s.name} must be a EUR amount like 12.50.`;
      if (s.requiresPayment && !s.price) return `${s.name} requires payment but has no price.`;
    }
    return null;
  }, [settings, services]);

  const requestSave = () => {
    if (!settings || validation) return;
    if (settings.enabled) setConfirmEnable(true); else void save();
  };

  const save = async () => {
    setConfirmEnable(false);
    if (!settings || validation) return;
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      const result = await updateTinanPaymentAdmin({
        settings: { ...settings, tokenAddress: settings.tokenAddress || null, treasuryAddress: settings.treasuryAddress || null, tinanPerEur: settings.tinanPerEur || null },
        services: services.map(({ price, ...s }) => ({ ...s, eurCents: price ? Math.round(Number(price) * 100) : null })),
      }, await authed());
      setInitRev(null); setSaved(true);
      invalidate();
      void admin.refetch();
      if (!result.ready && result.reason) setSaveError(`Saved. Not ready: ${result.reason}`);
    } catch (e) { setSaveError(apiError(e)); }
    finally { setSaving(false); }
  };

  const doExport = async () => {
    setExporting(true); setExportError(null);
    try {
      const csv = await exportTinanPayments(await authed());
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = `tinan-payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setExportError(apiError(e)); } finally { setExporting(false); }
  };

  const invoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(admin.data?.invoices ?? [])]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .filter((i) => (status === 'all' || i.status === status) && (!q || [i.id, i.payer, i.serviceName, i.txHash ?? '', i.error ?? ''].some((v) => v.toLowerCase().includes(q))));
  }, [admin.data, query, status]);

  const back = <Link href="/payments" className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-semibold hover:border-primary/60" data-testid="link-back-payments"><ArrowLeft className="h-4 w-4" />Payments</Link>;
  const header = <PageHeader eyebrow="Payments · Administration" title="TINAN payment controls" desc="Every value here is loaded from and saved to the server. Nothing activates until you explicitly enable it." action={back} />;

  if (!isLoaded || (isSignedIn && account.isLoading)) return <div className="mx-auto max-w-6xl">{header}<Panel title="Checking access"><Skeleton lines={4} /></Panel></div>;
  if (!isSignedIn) return <div className="mx-auto max-w-6xl">{header}<Empty icon={<Lock className="h-5 w-5" />} title="Sign in required" desc="Payment administration is only available to signed-in administrators."><Link href="/sign-in" className="text-sm font-semibold text-primary" data-testid="link-admin-sign-in">Sign in</Link></Empty></div>;
  if (account.isError) return <div className="mx-auto max-w-6xl">{header}<ErrorNote message={apiError(account.error)} onRetry={() => void account.refetch()} /></div>;
  if (!account.data?.isAdmin || (admin.error as { status?: number } | null)?.status === 403) return <div className="mx-auto max-w-6xl">{header}<Empty icon={<Lock className="h-5 w-5" />} title="Not authorized" desc="Your account is not a payment administrator. The server enforces this independently." /></div>;
  if (admin.isLoading || !settings) return <div className="mx-auto max-w-6xl">{header}{admin.isError ? <>
    <ErrorNote message={apiError(admin.error)} onRetry={() => void admin.refetch()} />
    {(admin.error as { status?: number })?.status === 503 && <Panel title="Explicit payment initialization">
      <p className="text-sm">Create missing disabled Sepolia configuration and service records only. Existing settings, invoices and history are never overwritten. This is an audited administrator action, not a read request.</p>
      <label className="my-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={initializationApproved} onChange={e => setInitializationApproved(e.target.checked)} />I authorize creating only missing payment records.</label>
      <Btn disabled={!initializationApproved || initializing} onClick={() => void initializeMissingRecords()} data-testid="button-initialize-payments">{initializing ? 'Initializing…' : 'Initialize missing records'}</Btn>
      {initializationError && <ErrorNote message={initializationError} />}
    </Panel>}
  </> : <Panel title="Loading configuration"><Skeleton lines={8} /></Panel>}</div>;

  const set = <K extends keyof TinanPaymentSettings>(k: K, v: TinanPaymentSettings[K]) => setSettings({ ...settings, [k]: v });
  const setSvc = (i: number, patch: Partial<ServiceDraft>) => setServices(services.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" data-testid="page-payment-admin" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 9rem)' }}>
      {header}
      <MainnetDeploymentAdmin />
      {cat && (cat.ready ? <Notice tone="ok" id="status-admin-ready">Catalog is ready. Revision {cat.settings.revision}.</Notice> : <Notice tone="warn" id="status-admin-not-ready">Not ready: {cat.reason ?? 'configuration incomplete'}. Revision {cat.settings.revision}.</Notice>)}

      <Panel eyebrow="Settings" title="Network, token and rate" id="panel-admin-settings" action={<Toggle checked={settings.enabled} onChange={(v) => set('enabled', v)} label={settings.enabled ? 'Payments enabled' : 'Payments disabled'} id="toggle-enabled" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Network">
            <Select value={settings.chainId} onChange={(e) => set('chainId', Number(e.target.value) as 1 | 11155111)} data-testid="select-chain">
              <option value={11155111}>Sepolia testnet (min 12 confirmations)</option>
              <option value={1}>Ethereum Mainnet (min 12 confirmations)</option>
            </Select>
          </Field>
          <Field label="Required confirmations" hint={`Whole number ${MIN_CONFIRMATIONS} to ${MAX_CONFIRMATIONS} on both networks. Values below ${MIN_CONFIRMATIONS} are never saved.`}>
            <Input type="number" min={MIN_CONFIRMATIONS} max={MAX_CONFIRMATIONS} step={1} inputMode="numeric" value={Number.isFinite(settings.confirmations) ? settings.confirmations : ''} onChange={(e) => set('confirmations', e.target.value === '' ? Number.NaN : Number(e.target.value))} data-testid="input-confirmations" />
          </Field>
          <Field label="Token address"><Input value={settings.tokenAddress ?? ''} onChange={(e) => set('tokenAddress', e.target.value.trim() || null)} placeholder="Not configured" className="font-mono text-xs" spellCheck={false} data-testid="input-token" /></Field>
          <Field label="Treasury address"><Input value={settings.treasuryAddress ?? ''} onChange={(e) => set('treasuryAddress', e.target.value.trim() || null)} placeholder="Not configured" className="font-mono text-xs" spellCheck={false} data-testid="input-treasury" /></Field>
          <Field label="TINAN per EUR" hint="Administrator-set decimal string. Leave empty to keep pricing unconfigured."><Input value={settings.tinanPerEur ?? ''} onChange={(e) => set('tinanPerEur', e.target.value.trim() || null)} placeholder="Not set" className="font-mono" maxLength={40} data-testid="input-rate" /></Field>
          <Field label="Rate source"><Input value={settings.rateSource} onChange={(e) => set('rateSource', e.target.value)} maxLength={200} data-testid="input-rate-source" /></Field>
        </div>
      </Panel>

      <Panel eyebrow="Catalog" title="Services" id="panel-admin-services">
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((s, i) => (
            <div key={s.slug} className="space-y-3 rounded-xl border border-border bg-background/35 p-4" data-testid={`card-admin-service-${s.slug}`}>
              <div className="flex items-center justify-between gap-2"><Badge tone="mute">{s.slug}</Badge><span className="font-mono text-[10px] text-muted-foreground" title="Route is server-owned">{s.route}</span></div>
              <Field label="Name"><Input value={s.name} maxLength={80} onChange={(e) => setSvc(i, { name: e.target.value })} data-testid={`input-service-name-${s.slug}`} /></Field>
              <Field label="Description"><Textarea rows={2} value={s.description} maxLength={400} onChange={(e) => setSvc(i, { description: e.target.value })} data-testid={`input-service-desc-${s.slug}`} /></Field>
              <Field label="Price (EUR)" hint={s.price ? undefined : 'Unpriced'}><Input inputMode="decimal" value={s.price} placeholder="Unpriced" onChange={(e) => setSvc(i, { price: e.target.value.trim() })} className="font-mono" data-testid={`input-service-price-${s.slug}`} /></Field>
              <div className="flex flex-wrap gap-2">
                <Toggle checked={s.enabled} onChange={(v) => setSvc(i, { enabled: v })} label="Enabled" id={`toggle-service-enabled-${s.slug}`} />
                <Toggle checked={s.requiresPayment} onChange={(v) => setSvc(i, { requiresPayment: v })} label="Requires payment" id={`toggle-service-payment-${s.slug}`} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Turning on "Requires payment" is the explicit opt-in that gates a service behind TINAN credits.</p>
      </Panel>

      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-popover/95 p-3 sm:flex-row sm:items-center" data-testid="payment-save-actions">
        <p className="flex-1 text-xs text-muted-foreground">{validation ?? `Saving sends revision ${settings.revision}; the server rejects it if someone saved in the meantime.`}</p>
        {saved && !saveError && <Badge tone="ok">Saved</Badge>}
        <Btn variant="gold" onClick={requestSave} disabled={saving || Boolean(validation)} data-testid="button-save-admin"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save configuration'}</Btn>
      </div>
      {saveError && <ErrorNote message={saveError} onRetry={() => { setInitRev(null); void admin.refetch(); }} />}

      {confirmEnable && <Modal open onClose={() => setConfirmEnable(false)} title="Submit an enabled checkout configuration?">
        <div className="space-y-4 text-sm">
          <Notice tone="warn">You are saving with payments switched on. The server refuses activation unless the exact Mainnet token is verified and approved, so checkout can remain disabled after saving. This dialog does not deploy, sign, or send anything.</Notice>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn onClick={() => setConfirmEnable(false)} data-testid="button-cancel-enable">Cancel</Btn>
            <Btn variant="gold" onClick={() => void save()} data-testid="button-confirm-enable">Submit enabled configuration</Btn>
          </div>
        </div>
      </Modal>}

      <MarketplaceAdmin />

      <Panel eyebrow="Ledger" title="Recent payments" id="panel-admin-payments"
        action={<div className="flex gap-2"><Btn size="sm" onClick={() => void admin.refetch()} disabled={admin.isFetching} data-testid="button-admin-refresh"><RefreshCw className={cn('h-3.5 w-3.5', admin.isFetching && 'animate-spin')} />Refresh</Btn><Btn size="sm" onClick={() => void doExport()} disabled={exporting} data-testid="button-export-csv"><Download className="h-3.5 w-3.5" />{exporting ? 'Exporting…' : 'Export CSV'}</Btn></div>}>
        {exportError && <div className="mb-3"><ErrorNote message={exportError} /></div>}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payer, service, hash, error" className="pl-9" data-testid="input-admin-search" /></div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-44" data-testid="select-admin-status">{STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</Select>
        </div>
        {invoices.length === 0 ? <Empty icon={<Search className="h-5 w-5" />} title="No payments" desc="No invoices match this view." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[.14em] text-muted-foreground"><tr className="border-b border-border">{['Created', 'Service', 'Payer', 'Amount', 'Status', 'Tx / error'].map((h) => <th key={h} className="py-2 pr-3 font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-border/60 align-top" data-testid={`row-admin-invoice-${i.id}`}>
                    <td className="py-2.5 pr-3 font-mono text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 pr-3">{i.serviceName}<div className="text-muted-foreground">{chainLabel(i.chainId)}</div></td>
                    <td className="py-2.5 pr-3 font-mono">{short(i.payer)}</td>
                    <td className="py-2.5 pr-3 font-mono">{i.amountTinan}<div className="text-muted-foreground">{eur(i.eurCents)}</div></td>
                    <td className="py-2.5 pr-3"><PaymentStatus status={i.status} /><div className="mt-1 font-mono text-muted-foreground">{i.confirmations}/{i.requiredConfirmations}</div></td>
                    <td className="max-w-[220px] py-2.5 pr-3">{i.txHash ? <a href={`${explorer(i.chainId)}/tx/${i.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{short(i.txHash, 8)}</a> : <span className="text-muted-foreground">—</span>}{i.error && <div className="mt-1 text-rose-300">{i.error}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
