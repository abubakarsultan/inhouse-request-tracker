import { Suspense } from 'react';
import { getProjectOverview } from '@/services/projects';
import ProjectsBrowser from '@/components/app/projects-browser';

function ProjectsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-20 rounded-2xl bg-[var(--card)]" />
      <div className="h-20 rounded-2xl bg-[var(--card)]" />
      <div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-56 rounded-2xl bg-[var(--card)]" />)}</div>
    </div>
  );
}

async function ProjectsData() {
  const overview = await getProjectOverview();
  return <ProjectsBrowser projects={overview.projects as any} categories={overview.categories as any} />;
}

export default async function ProjectsPage() {
  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Manage projects by category and control where their request data is mirrored.</p>
      </div>
      <Suspense fallback={<ProjectsLoading />}><ProjectsData /></Suspense>
    </div>
  );
}
