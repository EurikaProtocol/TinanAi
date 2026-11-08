import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Show, UserButton } from '@clerk/react';
import { ArrowUpRight, Blocks, Coins, FileSearch, FolderKanban, LayoutDashboard, Library, Menu, MessageSquare, Rocket, Settings, Wallet, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/helpers';
import { useWorkspace } from '@/lib/store';
import { CosmicBackground } from '@/components/cosmic-background';
import { LocalizedTree } from '@/lib/i18n';

const NAV: { href: string; label: string; icon: LucideIcon; id: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
  { href: '/assistant', label: 'Assistant', icon: MessageSquare, id: 'assistant' },
  { href: '/documents', label: 'Documents', icon: FileSearch, id: 'documents' },
  { href: '/knowledge', label: 'Knowledge Library', icon: Library, id: 'knowledge' },
  { href: '/builder', label: 'App Builder', icon: Blocks, id: 'builder' },
  { href: '/assets', label: 'Digital Assets', icon: FolderKanban, id: 'assets' },
  { href: '/tokenize', label: 'Tokenization', icon: Coins, id: 'tokenize' },
  { href: '/contracts', label: 'Contracts', icon: Blocks, id: 'contracts' },
  { href: '/payments', label: 'Payments', icon: Wallet, id: 'payments' },
  { href: '/mainnet-preparation', label: 'Mainnet Preparation', icon: Wallet, id: 'mainnet-preparation' },
  { href: '/data-tokenization', label: 'Data Studio', icon: FolderKanban, id: 'data-studio' },
  { href: '/launchpad', label: 'Launchpad', icon: Rocket, id: 'launchpad' },
  { href: '/settings', label: 'Settings', icon: Settings, id: 'settings' },
];
const TABS = ['dashboard', 'assistant', 'knowledge', 'builder', 'launchpad'];
const logo = `url(${import.meta.env.BASE_URL}brand/tinan-logo.svg)`;

function Mark({ size = 28 }: { size?: number }) {
  return <span aria-hidden className="logo-mask inline-block shrink-0" style={{ width: size, height: size, ['--logo' as string]: logo }} />;
}
function Brand() {
  return (
    <LocalizedTree>
    <Link href="/dashboard" data-testid="link-brand" className="flex items-center gap-3">
      <Mark />
      <span>
        <span className="block font-sans text-xl font-extrabold leading-none tracking-[.2em] gold-text">TINANAI</span>
        <span className="mt-1 hidden text-[9px] uppercase tracking-[.18em] text-muted-foreground min-[360px]:block">Intelligence. Data. Creation.</span>
      </span>
    </Link>
    </LocalizedTree>
  );
}
const active = (loc: string, href: string) => loc === href || (href === '/payments' && loc.startsWith('/payments/')) || (href === '/dashboard' && loc === '/');

export function Shell({ children, walletControl }: { children: ReactNode; walletControl: ReactNode }) {
  const [loc] = useLocation();
  const [more, setMore] = useState(false);
  const { data } = useWorkspace();
  return (
    <LocalizedTree>
    <>
      <CosmicBackground />
      <div className="relative z-10 min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 md:px-10 xl:px-14">
          <Brand />
          <div className="hidden min-w-0 flex-1 justify-center sm:flex">
            <Link href="/dashboard" data-testid="text-workspace-name" className="max-w-56 truncate rounded-full border border-border/80 bg-secondary/45 px-3.5 py-2 text-xs font-semibold text-foreground/80 transition hover:border-primary/40">
              {data.prefs.workspaceName}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {walletControl}
            <Show when="signed-out">
              <Link href="/sign-in" data-testid="link-sign-in" className="hidden h-10 items-center rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">Sign in</Link>
            </Show>
            <Show when="signed-in">
              <div className="mr-1"><UserButton /></div>
            </Show>
            <Link href="/builder" data-testid="link-get-started" className="hidden h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-300 to-sky-300 px-3.5 text-xs font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 lg:inline-flex lg:px-4 lg:text-sm">
              Get started <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <nav aria-label="Main navigation" className="border-t border-border/70" data-testid="nav-desktop">
          <div className="mx-auto hidden max-w-[1440px] items-center justify-between gap-2 overflow-x-auto px-10 md:flex xl:px-14">
            {NAV.map((n) => (
              <Link key={n.id} href={n.href} aria-current={active(loc, n.href) ? 'page' : undefined} data-testid={`link-nav-${n.id}`}
                className={cn('whitespace-nowrap border-b-2 px-2 py-3 text-xs font-semibold transition-colors', active(loc, n.href) ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {n.id === 'dashboard' ? 'Home' : n.id === 'builder' ? 'Project Builder' : n.label}
              </Link>
            ))}
          </div>
          <div className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto px-4 sm:justify-center sm:px-6 md:hidden">
            {NAV.filter((n) => TABS.includes(n.id)).map((n) => (
              <Link key={n.id} href={n.href} aria-current={active(loc, n.href) ? 'page' : undefined} data-testid={`link-tab-${n.id}`}
                className={cn('whitespace-nowrap border-b-2 px-2.5 py-3 text-[11px] font-semibold transition-colors', active(loc, n.href) ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {n.id === 'dashboard' ? 'Home' : n.id === 'builder' ? 'Builder' : n.id === 'assets' ? 'Assets' : n.label}
              </Link>
            ))}
            <button onClick={() => setMore(true)} aria-label="Open all tools" data-testid="button-tab-more" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-2.5 py-3 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground">
              <Menu className="h-3.5 w-3.5" /> More
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-14 pt-6 sm:px-6 md:px-10 md:pb-16 md:pt-10 xl:px-14">
        <div key={loc} className="animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div>
       <footer className="mt-16 flex flex-col gap-2 border-t border-border/80 pt-5 text-[10px] uppercase tracking-[.14em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
         <span>TINANAI · Powered by EUREKA CORE</span>
         <span className="normal-case tracking-normal">Workspace records stay in this browser. Knowledge Library is account-scoped and stored server-side.</span>
       </footer>
      </main>

      {more && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 animate-in fade-in" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-primary/30 bg-popover p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300">
            <div className="mb-4 flex items-center justify-between"><span className="font-sans text-xl font-bold text-foreground">All workspace tools</span>
              <button onClick={() => setMore(false)} aria-label="Close menu" data-testid="button-close-menu"><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              {NAV.map((n) => (
                <Link key={n.id} href={n.href} onClick={() => setMore(false)} data-testid={`link-more-${n.id}`}
                  className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm font-medium', active(loc, n.href) ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-foreground/85')}>
                  <n.icon className="h-4 w-4" />{n.label}
                </Link>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Workspace records stay in this browser. The Knowledge Library is private to your account and stored server-side. Tokenization tools are planning only.</p>
          </div>
        </div>
      )}
      </div>
    </>
    </LocalizedTree>
  );
}
