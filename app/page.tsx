import Link from 'next/link';

export default function Home(){
return <main className="p-10">
<h1 className="text-5xl font-bold">Inhouse Request</h1>
<p className="mt-4">Rankviz Outreach Management System</p>
<Link href="/dashboard">Open Dashboard</Link>
</main>
}
