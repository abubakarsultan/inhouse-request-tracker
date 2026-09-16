import RequestForm from '@/components/app/request-form';
import { getProjects } from '@/services/projects';
import { getAssignableUsers } from '@/services/users';

export default async function NewRequest() {
  const [projects, users] = await Promise.all([getProjects(), getAssignableUsers()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Create Request</h1>
      <RequestForm projects={projects} users={users} />
    </div>
  );
}
