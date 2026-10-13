import Sidebar from '@/components/sidebar';
import Topbar from '@/components/app/topbar';
import NavigationProgress from '@/components/app/navigation-progress';
import { Suspense } from 'react';
import { requireActiveProfile } from '@/lib/auth';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireActiveProfile();
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <Sidebar role={profile.role} />
      <main className="min-h-screen min-w-0 pb-24 lg:ml-60 lg:pb-0">
        <div className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8 2xl:px-10">
          <Topbar profile={profile} />
          {children}
        </div>
      </main>
    </div>
  );
}
