'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BlueprintView from './BlueprintView';
import { Badge } from './Shell';
import { getProject, type SavedProject } from '@/lib/projects';
import { getChain } from '@/lib/chains';

export default function ProjectView() {
  const path = usePathname();
  const id = path.split('/').filter(Boolean)[1];
  const [p, setP] = useState<SavedProject | null | undefined>(undefined);
  useEffect(() => setP(id ? getProject(id) ?? null : null), [id]);
  if (p === undefined) return null;
  if (!p) return <div className="glass p-6">Project not found in this browser. <Link className="text-cyan-300 underline" href="/projects">Back to projects</Link></div>;
  const c = getChain(p.chainId);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{p.blueprint.projectName}</h1>
      <div className="glass p-4 text-sm space-y-1">
        <Badge tone={p.status === 'deployed' ? 'cyan' : 'amber'}>{p.status.toUpperCase()}</Badge>
        <div>Network: {c?.name ?? '—'}</div>
        <div>Owner: <code className="break-all">{p.owner ?? '—'}</code></div>
        {p.tokenAddress && <div>Token: <code className="break-all">{p.tokenAddress}</code></div>}
        {p.txHash && c && <a className="underline text-cyan-300" href={`${c.explorer}/tx/${p.txHash}`} target="_blank" rel="noreferrer">Transaction</a>}
      </div>
      <BlueprintView b={p.blueprint} />
    </div>
  );
}
