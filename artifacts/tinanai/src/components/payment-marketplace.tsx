import { useState } from 'react';
import { CheckCircle2, Inbox, Send, XCircle } from 'lucide-react';
import { createTinanMarketplaceOrder, updateTinanMarketplaceOrder, type TinanMarketplaceOrder } from '@workspace/api-client-react';
import { Badge, Btn, Empty, ErrorNote, Field, Skeleton, Textarea } from '@/components/kit';
import { Notice, Panel } from '@/components/payment-ui';
import { apiError, useAuthedRequest, useInvalidatePayments, useMarketplaceOrders } from '@/lib/use-tinan-payments';
import { cn } from '@/lib/helpers';

const MIN = 10, MAX = 2000;
const valid = (t: string) => t.trim().length >= MIN && t.trim().length <= MAX;

function OrderStatus({ status }: { status: TinanMarketplaceOrder['status'] }) {
  const cls = { open: 'border-sky-400/40 bg-sky-400/10 text-sky-200', fulfilled: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', rejected: 'border-rose-400/40 bg-rose-400/10 text-rose-200' }[status];
  const label = { open: 'Open', fulfilled: 'Fulfilled', rejected: 'Rejected, credit restored' }[status];
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.12em]', cls)}>{label}</span>;
}

function OrderBody({ o }: { o: TinanMarketplaceOrder }) {
  return (
    <>
      <p className="whitespace-pre-wrap text-sm text-foreground/90">{o.request}</p>
      {o.response && (
        <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3" data-testid={`text-order-response-${o.id}`}>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary/80">Administrator response</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/85">{o.response}</p>
        </div>
      )}
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">Created {new Date(o.createdAt).toLocaleString()}{o.resolvedAt && ` · resolved ${new Date(o.resolvedAt).toLocaleString()}`} · invoice {o.invoiceId.slice(0, 8)}</p>
    </>
  );
}

/** User side: spend one confirmed marketplace credit on a manual request. */
export function MarketplaceRequests({ credits }: { credits: number }) {
  const orders = useMarketplaceOrders();
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!valid(text) || credits < 1) return;
    setBusy(true); setError(null);
    try { await createTinanMarketplaceOrder({ request: text.trim() }, await authed()); setText(''); invalidate(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const list = orders.data ?? [];
  return (
    <Panel eyebrow="Marketplace" title="Manual fulfillment requests" id="panel-marketplace">
      <Notice tone="info">A confirmed Marketplace payment buys <strong>one manual fulfillment request</strong> reviewed by an administrator. It is not an automatic asset purchase. If a request is rejected, exactly one credit is restored.</Notice>
      <div className="mt-4 space-y-3">
        <Field label={`Your request (${MIN}–${MAX} characters)`}>
          <Textarea rows={4} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} disabled={credits < 1} placeholder={credits < 1 ? 'Requires a confirmed Marketplace credit' : 'Describe what you need fulfilled'} data-testid="input-marketplace-request" />
        </Field>
        <Notice tone="warn">Never include private keys, seed phrases, passwords or other secrets. Administrators can read this text.</Notice>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" data-testid="text-marketplace-credits">{credits} confirmed credit{credits === 1 ? '' : 's'} available · {text.trim().length}/{MAX}</span>
          <Btn variant="gold" onClick={() => void submit()} disabled={busy || credits < 1 || !valid(text)} data-testid="button-submit-marketplace"><Send className="h-4 w-4" />{busy ? 'Submitting…' : 'Use one credit and submit'}</Btn>
        </div>
        {error && <ErrorNote message={error} />}
      </div>
      <div className="mt-6 border-t border-border/70 pt-4">
        {orders.isLoading ? <Skeleton lines={3} /> : orders.isError ? <ErrorNote message={`Requests unavailable: ${apiError(orders.error)}`} onRetry={() => void orders.refetch()} />
          : list.length === 0 ? <Empty icon={<Inbox className="h-5 w-5" />} title="No requests yet" desc="Requests you submit appear here with the administrator's response." />
          : (
            <ul className="space-y-3">
              {list.map((o) => (
                <li key={o.id} className="rounded-xl border border-border bg-background/30 p-4" data-testid={`row-order-${o.id}`}>
                  <div className="mb-2 flex justify-end"><OrderStatus status={o.status} /></div>
                  <OrderBody o={o} />
                </li>
              ))}
            </ul>
          )}
      </div>
    </Panel>
  );
}

function AdminOrder({ o }: { o: TinanMarketplaceOrder }) {
  const authed = useAuthedRequest();
  const invalidate = useInvalidatePayments();
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState<'fulfilled' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolve = async (status: 'fulfilled' | 'rejected') => {
    if (!valid(response)) return;
    setBusy(status); setError(null);
    try { await updateTinanMarketplaceOrder(o.id, { status, response: response.trim() }, await authed()); invalidate(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  return (
    <li className="rounded-xl border border-border bg-background/30 p-4" data-testid={`row-admin-order-${o.id}`}>
      <div className="mb-2 flex justify-end"><OrderStatus status={o.status} /></div>
      <OrderBody o={o} />
      {o.status === 'open' && (
        <div className="mt-3 space-y-2">
          <Field label={`Response to requester (${MIN}–${MAX} characters)`}><Textarea rows={3} maxLength={MAX} value={response} onChange={(e) => setResponse(e.target.value)} data-testid={`input-order-response-${o.id}`} /></Field>
          <p className="text-[11px] text-muted-foreground">Only mark fulfilled after you have actually delivered the work. Nothing is fulfilled automatically.</p>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="gold" disabled={busy !== null || !valid(response)} onClick={() => void resolve('fulfilled')} data-testid={`button-fulfill-${o.id}`}><CheckCircle2 className="h-3.5 w-3.5" />{busy === 'fulfilled' ? 'Saving…' : 'Mark fulfilled'}</Btn>
            <Btn size="sm" variant="danger" disabled={busy !== null || !valid(response)} onClick={() => void resolve('rejected')} data-testid={`button-reject-${o.id}`}><XCircle className="h-3.5 w-3.5" />{busy === 'rejected' ? 'Saving…' : 'Reject and restore credit'}</Btn>
          </div>
          {error && <ErrorNote message={error} />}
        </div>
      )}
    </li>
  );
}

/** Admin side: resolve open requests via the server endpoint. */
export function MarketplaceAdmin() {
  const orders = useMarketplaceOrders();
  const [showAll, setShowAll] = useState(false);
  const list = [...(orders.data ?? [])].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const shown = showAll ? list : list.filter((o) => o.status === 'open').concat(list.filter((o) => o.status !== 'open').slice(0, 10));
  const open = list.filter((o) => o.status === 'open').length;
  return (
    <Panel eyebrow="Marketplace" title="Fulfillment requests" id="panel-admin-marketplace" action={<div className="flex items-center gap-2"><Badge tone={open ? 'gold' : 'mute'}>{open} open</Badge><Btn size="sm" onClick={() => setShowAll(!showAll)} data-testid="button-toggle-orders">{showAll ? 'Open + recent' : 'Show all'}</Btn></div>}>
      {orders.isLoading ? <Skeleton lines={4} /> : orders.isError ? <ErrorNote message={apiError(orders.error)} onRetry={() => void orders.refetch()} />
        : shown.length === 0 ? <Empty icon={<Inbox className="h-5 w-5" />} title="No requests" desc="Marketplace requests from paying users appear here." />
        : <ul className="space-y-3">{shown.map((o) => <AdminOrder key={o.id} o={o} />)}</ul>}
    </Panel>
  );
}
