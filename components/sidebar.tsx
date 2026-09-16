import Link from 'next/link';

export default function Sidebar(){
return <aside className="fixed left-0 top-0 h-screen w-64 bg-black text-white p-6">
<h2 className="text-xl font-bold mb-8">Inhouse Request</h2>
<div className="space-y-4">
<Link href="/dashboard">Dashboard</Link>
<Link href="/projects">Projects</Link>
<Link href="/requests">Requests</Link>
<Link href="/import">Import</Link>
<Link href="/settings">Settings</Link>
</div>
</aside>
}
