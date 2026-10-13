import './globals.css';

export const metadata = { title: 'INHOUSE REQUEST | Rankviz', description: 'Rankviz outreach operations system' };
export const dynamic = 'force-dynamic';

const themeScript = `
try {
  const saved = localStorage.getItem('inhouse-theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
