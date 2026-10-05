'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from './Shell';
import { loadProjects, type SavedProject } from '@/lib/projects';
import { getChain } from '@/lib/chains';

export default function ProjectList() {
  const [list, setList] = useState<SavedProject[] | null>(null);
  useEffect(() => setList(loadProjects()), []);
  if (!list) return null;
  if (!list.length) return <div className="glass p-6 text-slate-300">No projects yet. <Link className="text-cyan-300 underline" href="/tokenize">Tokenize something</Link>.</div>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {list.map((p) => (
        <Link key={p.id} href={`/project/${p.id}/`} className="glass p-4 block hover:border-cyan-400/50">
          <div className="font-semibold">{p.blueprint.projectName}</div>
          <div className="text-xs text-slate-400">{p.blueprint.tokenStandard} · {p.blueprint.category} · {getChain(p.chainId)?.name ?? 'no network'}</div>
          <div className="mt-2"><Badge tone={p.status === 'deployed' ? 'cyan' : 'amber'}>{p.status.toUpperCase()}</Badge></div>
        </Link>
      ))}
    </div>
  );
}
