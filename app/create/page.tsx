'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BlueprintView from '@/components/BlueprintView';
import { Badge } from '@/components/Shell';
import type { Blueprint, TokenStandard } from '@/lib/blueprint';
import { loadDraft, saveDraft } from '@/lib/projects';

export default function Create() {
  const router = useRouter();
  const [b, setB] = useState<Blueprint | null>(null);
  const [source, setSource] = useState('');
  useEffect(() => {
    setB(loadDraft());
    setSource(sessionStorage.getItem('tinan.source') || '');
  }, []);

  if (!b) return (
    <div className="glass p-6">No blueprint yet. <Link className="text-cyan-300 underline" href="/tokenize">Start with TINAN AI</Link>.</div>
  );
  const set = <K extends keyof Blueprint>(k: K, v: Blueprint[K]) => setB({ ...b, [k]: v });
  const standard = b.tokenStandard;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex gap-2 items-center"><h1 className="text-2xl font-bold">Review & configure</h1>
          <Badge tone="violet">{source === 'ai' ? 'AI API' : 'LOCAL RULES — DEMO ANALYSIS'}</Badge></div>
        <div className="glass p-5 space-y-3">
          <div><label className="label">Token name</label><input className="input" maxLength={100} value={b.projectName} onChange={(e) => set('projectName', e.target.value)} /></div>
          <div><label className="label">Symbol (ERC-20)</label><input className="input" maxLength={11} value={b.symbol ?? ''} onChange={(e) => set('symbol', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
          <div><label className="label">Standard</label>
            <select className="input" value={standard} onChange={(e) => set('tokenStandard', e.target.value as TokenStandard)}>
              {['ERC-20', 'ERC-721', 'ERC-1155', 'Data Proof'].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Supply</label><input className="input" type="number" min={1} value={b.recommendedSupply} onChange={(e) => set('recommendedSupply', Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div>
            <div><label className="label">Decimals</label><input className="input" type="number" min={0} max={18} value={b.decimals} onChange={(e) => set('decimals', Math.min(18, Math.max(0, Math.floor(Number(e.target.value) || 0))))} /></div>
          </div>
          {standard !== 'ERC-20' && (
            <p className="text-xs text-amber-300">{standard === 'ERC-1155' ? 'ERC-1155 deployment: COMING SOON (blueprint only).' : standard === 'ERC-721' ? 'ERC-721 deployment via NFTFactory: COMING SOON in this UI.' : 'Data Proof is submitted through the DataProofRegistry from the Verify page.'}</p>
          )}
        </div>
        <button className="btn" disabled={standard === 'ERC-20' && !b.symbol} onClick={() => { saveDraft(b); router.push('/deploy/'); }}>Continue to deploy</button>
        {standard === 'ERC-20' && !b.symbol && <p className="text-xs text-slate-400">Choose a symbol to continue.</p>}
      </div>
      <BlueprintView b={b} />
    </div>
  );
}
