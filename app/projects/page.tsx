import ProjectList from '@/components/ProjectList';
import { Badge } from '@/components/Shell';

export default function Projects() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Project Registry</h1>
      <p className="text-sm text-slate-400">Showing projects saved in this browser. <Badge tone="amber">ON-CHAIN REGISTRY BROWSING: COMING SOON</Badge></p>
      <ProjectList />
    </div>
  );
}
