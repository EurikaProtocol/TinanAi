import ProjectView from '@/components/ProjectView';

// Static export needs at least one param; Cloudflare _redirects serves this shell for any /project/* id.
export function generateStaticParams() {
  return [{ id: 'demo' }];
}

export default function ProjectPage() {
  return <ProjectView />;
}
