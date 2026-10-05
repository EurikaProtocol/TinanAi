'use client';
import { useState } from 'react';
import { Badge } from './Shell';
import { CHAINS } from '@/lib/chains';

export default function VerifyView() {
  const [hash, setHash] = useState('');
  const [name, setName] = useState('');
  async function onFile(f: File | undefined) {
    if (!f) return;
    setName(f.name);
    const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
    setHash('0x' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''));
  }
  const anyRegistry = CHAINS.some((c) => c.dataProofRegistry);
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-3xl font-bold">Verify / Data Proof</h1>
      <div className="glass p-5 space-y-3 text-sm">
        <p className="text-slate-300">Compute a SHA-256 hash of a file locally. The file never leaves your browser.</p>
        <input type="file" onChange={(e) => onFile(e.target.files?.[0])} />
        {hash && <div>{name}<br /><code className="break-all text-cyan-300">{hash}</code></div>}
        <p className="text-slate-400">A hash proves a file existed unchanged at a point in time. It does not prove ownership, legality or asset verification.</p>
        <Badge tone="amber">{anyRegistry ? 'ON-CHAIN SUBMISSION UI: COMING SOON' : 'DataProofRegistry NOT DEPLOYED — DEMO'}</Badge>
      </div>
    </div>
  );
}
