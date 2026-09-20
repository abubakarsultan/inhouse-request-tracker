import './globals.css';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/app/topbar';

export const metadata = { title: 'INHOUSE REQUEST | Rankviz', description: 'Rankviz outreach operations system' };

// No cookies/session are read anymore, so without this Next.js could
// pre-render pages at build time and show stale counts/data.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50">
        <Sidebar />
        <main className="min-h-screen p-6 lg:ml-64 lg:p-10">
          <Topbar />
          {children}
        </main>
      </body>
    </html>
  );
}
