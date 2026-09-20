import SiteCheckPanel from '@/components/app/site-check-panel';

export default function SiteCheckPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Website Availability Checker</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Checks the site database across every project using exact host matching. Protocol, www, path, query and port are ignored.</p>
      </div>
      <SiteCheckPanel />
    </div>
  );
}
