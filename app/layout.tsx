import './globals.css';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/app/topbar';

export const metadata = { title: 'INHOUSE REQUEST | Rankviz', description: 'Rankviz outreach operations system' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="min-h-screen p-5 pb-24 lg:ml-64 lg:p-10">
          <Topbar />
          {children}
        </main>
      </body>
    </html>
  );
}
