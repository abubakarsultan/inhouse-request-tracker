import RequestForm from '@/components/app/request-form';
import { getProjects } from '@/services/projects';

export default async function NewRequest() {
  const projects = await getProjects();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Create Request</h1>
      <RequestForm projects={projects} />
    </div>
  );
}
