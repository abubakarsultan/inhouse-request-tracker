import './globals.css';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/app/topbar';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'INHOUSE REQUEST | Rankviz', description: 'Rankviz outreach operations system' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="bg-slate-50">
        {user && <Sidebar role={user.role} />}
        <main className={user ? 'min-h-screen p-6 lg:ml-64 lg:p-10' : 'min-h-screen'}>
          {user && <Topbar user={user} />}
          {children}
        </main>
      </body>
    </html>
  );
}
