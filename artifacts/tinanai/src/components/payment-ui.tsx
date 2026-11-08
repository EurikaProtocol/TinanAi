import type { ReactNode } from 'react';
import { formatUnits } from 'viem';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Loader2, XCircle } from 'lucide-react';
import type { TinanPaymentInvoice, TinanPaymentInvoiceStatus } from '@workspace/api-client-react';
import { cn } from '@/lib/helpers';

export const explorer = (chain: number) => (chain === 1 ? 'https://etherscan.io' : 'https://sepolia.etherscan.io');
export const chainLabel = (chain: number) => (chain === 1 ? 'Ethereum Mainnet' : chain === 11155111 ? 'Sepolia testnet' : `Chain ${chain}`);
export const eur = (cents: number | null | undefined) =>
  cents == null ? 'Unpriced' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const short = (a: string | null | undefined, n = 6) => (!a ? '—' : a.length <= n * 2 + 2 ? a : `${a.slice(0, n + 2)}…${a.slice(-n)}`);
export const fmtUnits = (v: bigint, d: number, max = 6) => {
  const [w, f] = formatUnits(v, d).split('.');
  const whole = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = f ? f.slice(0, max).replace(/0+$/, '') : '';
  return frac ? `${whole}.${frac}` : whole;
};

const STATUS: Record<TinanPaymentInvoiceStatus, { label: string; cls: string; icon: typeof Clock3 }> = {
  created: { label: 'Awaiting transfer', cls: 'border-sky-400/40 bg-sky-400/10 text-sky-200', icon: CircleDashed },
  pending: { label: 'Pending', cls: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200', icon: Loader2 },
  confirming: { label: 'Confirming', cls: 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100', icon: Loader2 },
  confirmed: { label: 'Confirmed', cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'border-rose-400/40 bg-rose-400/10 text-rose-200', icon: XCircle },
  expired: { label: 'Expired', cls: 'border-slate-500/50 bg-slate-500/10 text-slate-300', icon: Clock3 },
};

export function PaymentStatus({ status, id }: { status: TinanPaymentInvoiceStatus; id?: string }) {
  const s = STATUS[status];
  const spin = status === 'pending' || status === 'confirming';
  return (
    <span data-testid={id ? `status-invoice-${id}` : undefined} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.12em]', s.cls)}>
      <s.icon className={cn('h-3 w-3', spin && 'animate-spin')} />{s.label}
    </span>
  );
}

export function ConfirmationMeter({ invoice }: { invoice: TinanPaymentInvoice }) {
  const req = Math.max(1, invoice.requiredConfirmations);
  const pct = Math.min(100, (invoice.confirmations / req) * 100);
  return (
    <div className="space-y-1" data-testid={`meter-confirmations-${invoice.id}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full origin-left rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})`, width: '100%' }} />
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">{invoice.confirmations}/{invoice.requiredConfirmations} confirmations</p>
    </div>
  );
}

export function Stat({ k, v, id, mono = true, hint }: { k: string; v: ReactNode; id: string; mono?: boolean; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{k}</dt>
      <dd className={cn('mt-1 break-all text-sm text-foreground', mono && 'font-mono text-xs')} data-testid={id}>{v}</dd>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children, id }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; id?: string }) {
  const t = {
    info: 'border-sky-400/30 bg-sky-400/5 text-sky-100/90',
    warn: 'border-amber-400/30 bg-amber-400/5 text-amber-100/90',
    danger: 'border-rose-400/40 bg-rose-500/10 text-rose-100',
    ok: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-100/90',
  }[tone];
  const Icon = tone === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} data-testid={id} className={cn('flex gap-3 rounded-lg border p-3 text-xs leading-relaxed', t)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Panel({ title, eyebrow, action, children, id, className }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section data-testid={id} className={cn('rounded-2xl border border-card-border bg-[linear-gradient(150deg,rgba(15,30,54,.92),rgba(8,17,33,.9))] p-5 shadow-[0_24px_70px_rgba(1,7,18,.28),inset_0_1px_rgba(255,255,255,.04)] md:p-6', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary/80">{eyebrow}</p>}
          <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
