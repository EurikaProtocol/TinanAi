import { Fragment, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/helpers';
import { LocalizedTree } from '@/lib/i18n';

const variants = {
  gold: 'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_0_1px_hsl(188_80%_78%/.25)_inset]',
  outline: 'border border-input text-foreground hover:border-primary/60 hover:text-primary',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-secondary',
  danger: 'border border-destructive/50 text-destructive hover:bg-destructive/10',
};
export function Btn({ variant = 'outline', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: 'sm' | 'md' }) {
  return <button {...p} className={cn('inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-200 active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', variants[variant], className)} />;
}
const field = 'w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, 'h-10', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, 'py-2.5 leading-relaxed resize-y', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, 'h-10 appearance-none', p.className)} />;
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground/70">{hint}</span>}
    </label>
  );
}
export function Card({ className, children, ...p }: { className?: string; children: ReactNode; 'data-testid'?: string; onClick?: () => void }) {
  return <div {...p} className={cn('rounded-xl border border-card-border bg-card/80 backdrop-blur p-5', className)}>{children}</div>;
}
export function PageHeader({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[.24em] text-primary/90">{eyebrow}</p>
        <h1 className="mt-2 font-sans text-4xl font-bold tracking-[-.045em] md:text-5xl leading-[1.02]">{title}</h1>
        {desc && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{desc}</p>}
      </div>
      {action}
    </header>
  );
}
export function Badge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'mute' | 'ok' }) {
  const t = { gold: 'border-primary/40 text-primary bg-primary/10', mute: 'border-border text-muted-foreground', ok: 'border-emerald-500/30 text-emerald-400/90 bg-emerald-500/5' }[tone];
  return <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', t)}>{children}</span>;
}
export function Empty({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary/5 text-primary">{icon}</div>
      <h3 className="font-serif text-2xl">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{desc}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" data-testid="text-error" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="flex-1">{message}</div>
      {onRetry && <Btn size="sm" variant="outline" onClick={onRetry} data-testid="button-retry">Retry</Btn>}
    </div>
  );
}
export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" data-testid="status-loading">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="shimmer h-3.5 rounded bg-secondary" style={{ width: `${95 - i * 13}%` }} />)}
    </div>
  );
}
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; 'data-no-translate-title'?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <LocalizedTree>
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 animate-in fade-in" onClick={onClose} />
      <div className={cn('relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-popover-border bg-popover p-6 animate-in slide-in-from-bottom-4 fade-in duration-300 sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-3xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" data-testid="button-close-modal" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
    </LocalizedTree>
  );
}

function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i} className="text-foreground">{p.slice(2, -2)}</strong>
    : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-[.85em] text-primary">{p.slice(1, -1)}</code>
    : <Fragment key={i}>{p}</Fragment>);
}
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(<pre key={k++} className="my-3 overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground/90">{buf.join('\n')}</pre>);
    } else if (/^#{1,4}\s/.test(l)) {
      const lv = l.match(/^#+/)![0].length;
      out.push(<h4 key={k++} className={cn('mt-5 mb-2 font-serif font-semibold text-foreground', lv <= 2 ? 'text-2xl' : 'text-xl text-primary')}>{inline(l.replace(/^#+\s/, ''))}</h4>); i++;
    } else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ord = /^\s*\d+\./.test(l); const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ''));
      const Tag = ord ? 'ol' : 'ul';
      out.push(<Tag key={k++} className={cn('my-2 space-y-1 pl-5 marker:text-primary', ord ? 'list-decimal' : 'list-disc')}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</Tag>);
    } else if (l.trim() === '') i++;
    else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(<p key={k++} className="my-2">{inline(buf.join(' '))}</p>);
    }
  }
  return <div className="text-sm leading-relaxed text-foreground/85 break-words">{out}</div>;
}
