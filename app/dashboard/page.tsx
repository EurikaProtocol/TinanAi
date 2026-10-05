import ProjectList from '@/components/ProjectList';
import Link from 'next/link';

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="flex gap-3"><Link className="btn" href="/tokenize">New tokenization</Link><Link className="btn-ghost" href="/wallet">Wallet</Link></div>
      <ProjectList />
    </div>
  );
}
