'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { useWallet } from '@/lib/wallet';
import { CHAINS, getChain } from '@/lib/chains';

const NAV = [
  ['/ai', 'TINAN AI'], ['/tokenize', 'Tokenize'], ['/projects', 'Projects'], ['/dashboard', 'Dashboard'],
  ['/tokens', 'Tokens'], ['/contracts', 'Contracts'], ['/verify', 'Verify'], ['/community', 'Community'], ['/docs', 'Docs'],
];

export function ConnectButton() {
  const { address, chainId, connect, disconnect } = useWallet();
  if (!address) return <button className="btn" onClick={connect}>Connect Wallet</button>;
  return (
    <button className="btn-ghost" onClick={disconnect} title="Click to forget locally">
      {getChain(chainId)?.name ?? `Chain ${chainId ?? '?'}`} · {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-navy-900/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4 flex-wrap">
          <Link href="/" className="leading-tight">
            <div className="font-bold tracking-[0.25em] text-cyan-300">EUREKA</div>
            <div className="text-[10px] tracking-widest text-slate-400">A BRIGHTER TOMORROW</div>
          </Link>
          <nav className="hidden lg:flex gap-4 text-sm text-slate-300 flex-1 justify-center">
            {NAV.map(([h, l]) => (<Link key={h} href={h} className="hover:text-cyan-300">{l}</Link>))}
          </nav>
          <div className="ml-auto"><ConnectButton /></div>
        </div>
        <nav className="lg:hidden flex gap-3 overflow-x-auto px-4 pb-2 text-xs text-slate-300">
          {NAV.map(([h, l]) => (<Link key={h} href={h} className="whitespace-nowrap">{l}</Link>))}
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10">{children}</main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-400 space-y-1">
        <div>TINAN AI — Not Artificial Intelligence. Natural Intelligence.</div>
        <div>
          <Link href="/about">About</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/wallet">Wallet</Link>
        </div>
        <div>Technical tooling only. No financial advice. No guaranteed returns. Networks: {CHAINS.map((c) => c.name).join(', ')}.</div>
      </footer>
    </div>
  );
}

export function Badge({ children, tone = 'cyan' }: { children: ReactNode; tone?: 'cyan' | 'amber' | 'violet' }) {
  const t = { cyan: 'border-cyan-400/40 text-cyan-300', amber: 'border-amber-400/50 text-amber-300', violet: 'border-violet-400/50 text-violet-300' }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] tracking-widest ${t}`}>{children}</span>;
}

export function ComingSoon({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass p-8 space-y-3">
      <Badge tone="amber">COMING SOON</Badge>
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="text-slate-300 space-y-2">{children}</div>
    </div>
  );
}

export function Mascot({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="TINAN mascot" role="img">
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="url(#mg)" opacity="0.9" />
      <circle cx="35" cy="45" r="7" fill="#0a1128" /><circle cx="65" cy="45" r="7" fill="#0a1128" />
      <circle cx="37" cy="43" r="2.5" fill="#fff" /><circle cx="67" cy="43" r="2.5" fill="#fff" />
      <path d="M36 64 Q50 76 64 64" stroke="#0a1128" strokeWidth="4" fill="none" strokeLinecap="round" />
      <line x1="50" y1="6" x2="50" y2="-2" stroke="#22d3ee" strokeWidth="3" /><circle cx="50" cy="2" r="3" fill="#22d3ee" />
    </svg>
  );
}
