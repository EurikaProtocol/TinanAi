'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyze, CATEGORIES, DISCLAIMER } from '@/lib/blueprint';
import { saveDraft } from '@/lib/projects';
import { useWallet } from '@/lib/wallet';

export default function PromptBox() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const [text, setText] = useState('');
  const [cat, setCat] = useState('auto');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (text.trim().length < 10) return;
    setBusy(true);
    const { blueprint, source } = await analyze(text, cat);
    saveDraft(blueprint);
    sessionStorage.setItem('tinan.source', source);
    router.push('/create/');
  }

  return (
    <div className="glass p-6 space-y-4">
      {!address && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
          <span>Step 1 — connect your wallet (you can analyse first; signing needs a wallet).</span>
          <button className="btn" onClick={connect}>Connect Wallet</button>
        </div>
      )}
      <div>
        <label className="label" htmlFor="what">WHAT DO YOU WANT TO TOKENIZE?</label>
        <textarea id="what" className="input h-32" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. A dataset of rooftop solar output readings that members can access with a utility token…" />
      </div>
      <div>
        <label className="label" htmlFor="cat">Category</label>
        <select id="cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="auto">Let TINAN AI decide</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <button className="btn" disabled={busy || text.trim().length < 10} onClick={go}>
        {busy ? 'TINAN AI is thinking…' : 'Analyse with TINAN AI'}
      </button>
      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </div>
  );
}
