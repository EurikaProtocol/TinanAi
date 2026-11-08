import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, FileText, ShieldAlert } from 'lucide-react';
import { Badge, Card, Empty } from '@/components/kit';
import type { LaunchDraft } from '@/lib/store';
import { fmtDate } from '@/lib/helpers';

const nav = [
  ['Overview', '/launchpad'],
  ['Contracts', '/launchpad/contracts'],
  ['My tokens', '/launchpad/tokens'],
  ['Explore', '/launchpad/explore'],
  ['Analytics', '/launchpad/analytics'],
  ['History', '/launchpad/history'],
  ['Guide', '/launchpad/guide'],
] as const;

export function LaunchpadFrame({ children, active }: { children: ReactNode; active: string }) {
  return (
    <div className="mx-auto max-w-6xl pb-12" data-testid="launchpad-page">
      <div className="mb-7 flex flex-col gap-5 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-primary">TINANAI / Launchpad</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Review your draft, connect a wallet, and request an ERC-20 deployment on Sepolia.</p>
        </div>
        <nav aria-label="Launchpad navigation" className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} data-testid={`link-launchpad-${label.toLowerCase().replaceAll(' ', '-')}`} aria-current={active === href ? 'page' : undefined}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition ${active === href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
              {label}
            </Link>
          ))}
          <Link href="/launchpad/contracts" data-testid="link-create-contract" className="ml-1 inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            Create contract <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </div>
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[.06] p-3.5 text-sm text-amber-100/90" role="note" data-testid="notice-launchpad-scope">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <span><strong className="font-semibold text-amber-100">Testnet only.</strong> Drafts and deployment history are saved in this browser. A Sepolia transaction is submitted only after review and wallet approval.</span>
      </div>
      {children}
    </div>
  );
}

export function DraftCard({ draft }: { draft: LaunchDraft }) {
  return (
    <Card className="group transition-colors hover:border-primary/35" data-testid={`card-launch-draft-${draft.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-serif text-2xl text-foreground" data-testid={`text-draft-name-${draft.id}`}>{draft.name}</p>
          <p className="mt-1 font-mono text-xs tracking-wider text-primary">{draft.symbol}</p>
        </div>
        <Badge tone="mute">Draft</Badge>
      </div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{draft.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span className="capitalize">{draft.kind} token</span><span aria-hidden>·</span><span>{draft.network} proposed</span><span aria-hidden>·</span><span>Updated {fmtDate(draft.updatedAt)}</span>
      </div>
      <Link href={`/launchpad/token/${encodeURIComponent(draft.id)}`} data-testid={`link-open-draft-${draft.id}`} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-foreground">
        <FileText className="h-3.5 w-3.5" /> Review draft <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </Link>
    </Card>
  );
}

export function DraftCollection({ drafts }: { drafts: LaunchDraft[] }) {
  if (drafts.length === 0) return (
    <Empty icon={<FileText className="h-5 w-5" />} title="No drafts saved yet" desc="Start with a purpose and keep the proposed parameters reviewable. Your drafts stay in this browser.">
      <Link href="/launchpad/create" data-testid="link-empty-create" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Create a draft</Link>
    </Empty>
  );
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="list-launch-drafts">{drafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)}</div>;
}

export function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="mb-7 max-w-3xl"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">{eyebrow}</p><h1 className="mt-2 font-sans text-4xl font-bold tracking-[-.045em] leading-tight md:text-5xl">{title}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p></header>;
}

export function QuietEmpty({ title, description, testId }: { title: string; description: string; testId: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center" data-testid={testId}><div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-border bg-secondary/60 text-muted-foreground"><FileText className="h-5 w-5" /></div><h2 className="font-serif text-2xl">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p></div>;
}

