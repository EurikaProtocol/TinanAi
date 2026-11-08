import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, Blocks, Coins, FileSearch, FolderKanban, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Btn, Card, Empty, PageHeader } from '@/components/kit';
import { fmtDate } from '@/lib/helpers';
import { now, uid, useWorkspace } from '@/lib/store';
import { LocalizedTree, translateUiText, useI18n } from '@/lib/i18n';

export default function Dashboard() {
  const { locale } = useI18n();
  const { data, upsert } = useWorkspace();
  const stats = [
    { id: 'projects', label: 'App projects', n: data.projects.length, href: '/builder', icon: Blocks },
    { id: 'assets', label: 'Digital assets', n: data.assets.length, href: '/assets', icon: FolderKanban },
    { id: 'plans', label: 'Token plans', n: data.tokenPlans.length, href: '/tokenize', icon: Coins },
    { id: 'analyses', label: 'Saved analyses', n: data.analyses.length, href: '/documents', icon: FileSearch },
    { id: 'chats', label: 'Conversations', n: data.conversations.length, href: '/assistant', icon: MessageSquare },
  ];
  const tools = [
    { href: '/assistant', t: 'Think it through', d: 'Work through a question with saved conversation history.', i: MessageSquare, color: 'text-cyan-200' },
    { href: '/documents', t: 'Find the signal', d: 'Analyze text, TXT, MD or CSV against a goal.', i: FileSearch, color: 'text-violet-200' },
    { href: '/builder', t: 'Shape an idea', d: 'Create a self-contained HTML prototype you can inspect and export.', i: Blocks, color: 'text-cyan-200' },
    { href: '/assets', t: 'Keep an inventory', d: 'Catalogue the digital assets that matter to your work.', i: FolderKanban, color: 'text-violet-200' },
    { href: '/tokenize', t: 'Plan a token', d: 'Explore a plan. Nothing is deployed or created on-chain.', i: Coins, color: 'text-cyan-200' },
  ];
  const recent = [
    ...data.projects.map((p) => ({ k: 'Project', n: p.name, d: p.updatedAt, href: '/builder', id: p.id })),
    ...data.assets.map((p) => ({ k: 'Asset', n: p.name, d: p.createdAt, href: '/assets', id: p.id })),
    ...data.analyses.map((p) => ({ k: 'Analysis', n: p.name, d: p.createdAt, href: '/documents', id: p.id })),
    ...data.tokenPlans.map((p) => ({ k: 'Token plan', n: p.name, d: p.createdAt, href: '/tokenize', id: p.id })),
    ...data.conversations.map((p) => ({ k: 'Conversation', n: p.title, d: p.updatedAt, href: '/assistant', id: p.id })),
  ].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 6);
  const sample = () => upsert('assets', { id: uid(), name: 'Sample: Founder brand kit', type: 'Brand', description: 'Sample record — illustrative only. Edit or delete it any time.', value: 12000, status: 'Draft', createdAt: now() });
  const project = data.projects[0];

  return (
    <LocalizedTree>
    <div className="space-y-12">
      <section className="relative isolate overflow-hidden rounded-[1.6rem] border border-slate-600/50 bg-[#0b1427]/90 px-5 py-8 sm:px-8 md:px-11 md:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-24 -top-32 h-[440px] w-[440px] rounded-full bg-cyan-300/[.07] blur-[90px]" />
          <div className="absolute right-[15%] top-[45%] h-64 w-64 rounded-full bg-violet-400/[.08] blur-[90px]" />
          <div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: 'linear-gradient(rgba(130,170,220,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(130,170,220,.12) 1px,transparent 1px)', backgroundSize: '48px 48px', maskImage: 'linear-gradient(90deg,black,transparent 78%)' }} />
        </div>
        <div className="relative grid items-center gap-9 lg:grid-cols-[1.1fr_.9fr]">
          <div className="max-w-[670px]">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-100/80">
              <span className="h-px w-6 bg-gradient-to-r from-cyan-300 to-violet-300" />
              Your idea, built with intention <span className="hidden text-slate-500 sm:inline">/</span> <span className="hidden sm:inline">{data.prefs.workspaceName}</span>
            </p>
            <h1 className="mt-6 text-[clamp(2.3rem,10vw,5.35rem)] font-extrabold leading-[.98] tracking-[-.065em] text-slate-50">
              Build anything<br />with <span className="gold-text">TINANAI.</span>
            </h1>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-slate-950/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-cyan-100 shadow-[0_0_26px_rgba(58,211,255,.1)]">
              <Sparkles className="h-3.5 w-3.5 text-violet-200" />
              AI builder by EurekaCore
            </p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300/80 sm:text-base">
              Go from an idea to an app you can preview, inspect and export. Bring your questions, documents and digital assets into one useful workspace.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/builder" data-testid="link-hero-builder" className="group inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-300 to-sky-300 px-4 text-sm font-extrabold text-slate-950 shadow-[0_8px_28px_rgba(61,213,230,.14)] transition hover:-translate-y-0.5 hover:brightness-105">
                Start building <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/assistant" data-testid="link-hero-assistant" className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-500/60 bg-slate-900/50 px-4 text-sm font-semibold text-slate-100 transition hover:border-violet-300/60 hover:bg-violet-300/[.07]">
                Ask the assistant <ArrowRight className="h-4 w-4 text-violet-200" />
              </Link>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[11px] leading-relaxed text-slate-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300" />
              Provider availability is shown when you use a tool. No simulated AI generation.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[480px] lg:ml-auto">
            <div className="absolute -inset-4 rounded-[1.6rem] border border-cyan-200/[.08] rotate-[2deg]" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-500/50 bg-[#0d172a]/95 shadow-[0_30px_100px_rgba(0,0,0,.34)]">
              <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
                <div className="flex items-center gap-1.5" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-rose-300/80" /><span className="h-2 w-2 rounded-full bg-amber-200/80" /><span className="h-2 w-2 rounded-full bg-emerald-200/80" /></div>
                <span className="text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">Workspace preview</span>
                <ShieldCheck className="h-4 w-4 text-cyan-200/75" />
              </div>
              {project ? (
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                     <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-200/80">Your saved project</p><h2 data-no-translate className="mt-3 break-words text-xl font-bold tracking-tight text-slate-100">{project.name}</h2></div>
                    <Badge>{fmtDate(project.updatedAt)}</Badge>
                  </div>
                   <p data-no-translate className="mt-3 line-clamp-3 text-xs leading-6 text-slate-400">{project.description || translateUiText('A project saved in this workspace.', locale)}</p>
                  <Link href="/builder" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-100 hover:text-white">Open project workspace <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
              ) : (
                <div className="relative min-h-[250px] overflow-hidden p-5 sm:p-6">
                  <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-violet-400/[.06] blur-3xl" />
                  <p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-200/80">Ready when you are</p>
                  <h2 className="mt-5 max-w-xs text-2xl font-bold leading-tight tracking-[-.04em] text-slate-100">Your workspace, before the first draft.</h2>
                  <p className="mt-3 max-w-sm text-xs leading-6 text-slate-400">This is an empty preview, not generated output. Start a project to see your own work here.</p>
                  <div className="mt-6 flex items-center gap-2 border-t border-slate-700/70 pt-4 text-[10px] text-slate-500">
                    <span className="grid h-6 w-6 place-items-center rounded-md border border-slate-600/70 bg-slate-800/70"><Blocks className="h-3 w-3 text-violet-200" /></span>
                    No projects saved yet
                  </div>
                </div>
              )}
            </div>
            <div className="absolute -right-1 top-[62px] flex items-center gap-2 rounded-lg border border-slate-500/60 bg-[#111d32] px-3 py-2 shadow-xl sm:-right-4">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-300/15 text-emerald-200"><ShieldCheck className="h-4 w-4" /></span>
              <span><span className="block text-[10px] font-bold text-slate-100">Local workspace</span><span className="block text-[9px] text-slate-400">Your data stays in this browser</span></span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Workspace totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.id} href={s.href} data-testid={`card-stat-${s.id}`} className="group rounded-xl border border-card-border bg-card/75 p-4 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card">
            <div className="flex items-center justify-between"><s.icon className="h-4 w-4 text-cyan-200/80" /><ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-cyan-100" /></div>
            <p className="mt-4 font-mono text-3xl font-medium tracking-tight text-slate-100" data-testid={`text-stat-${s.id}`}>{s.n}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </section>

      <section>
        <PageHeader eyebrow="Make a start" title="A good next step" desc="Every tool keeps its own history in this browser. Pick up where your idea needs you." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {tools.map((t, i) => (
            <Link key={t.href} href={t.href} data-testid={`card-tool-${t.href.slice(1)}`}
              className={`group relative overflow-hidden rounded-xl border border-card-border bg-card/70 p-5 transition hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-card ${i < 2 ? 'xl:col-span-3' : 'xl:col-span-2'}`}>
              <div className="flex items-center justify-between"><t.i className={`h-5 w-5 ${t.color}`} /><ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan-100" /></div>
              <h3 className="mt-5 text-lg font-bold tracking-tight">{t.t}</h3>
              <p className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground">{t.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <PageHeader eyebrow="Your workspace" title="Recently touched" desc="Records you have saved here, newest first." />
        {recent.length === 0 ? (
          <Empty icon={<Sparkles className="h-5 w-5" />} title="A clear starting point" desc="Nothing has been saved in this workspace yet. Your activity will appear here as you work.">
            <Btn variant="gold" onClick={sample} data-testid="button-add-sample">Add clearly marked sample asset</Btn>
          </Empty>
        ) : (
          <Card className="divide-y divide-border/80 overflow-hidden p-0">
            {recent.map((r, i) => (
              <Link key={`${r.k}-${r.id}`} href={r.href} data-testid={`row-recent-${i}`} className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-secondary/50 sm:px-5">
                <span className="flex min-w-0 items-center gap-3"><Badge>{r.k}</Badge><span className="truncate text-sm font-medium">{r.n}</span></span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(r.d)}</span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
    </LocalizedTree>
  );
}
