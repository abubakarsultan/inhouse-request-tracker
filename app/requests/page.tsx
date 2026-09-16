import StatusBadge from '@/components/status-badge';
export default function Requests(){
 const rows=[{url:'example.com',anchor:'SaaS link building',status:'Request Shared'}];
 return <div><div className="mb-6 flex justify-between"><h1 className="text-2xl font-bold">Requests</h1><a className="rounded bg-black px-4 py-2 text-white" href="/requests/new">New Request</a></div><div className="rounded-xl border bg-white"><table className="w-full"><thead><tr><th className="p-3 text-left">Website</th><th>Anchor</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.url}><td className="p-3">{r.url}</td><td>{r.anchor}</td><td><StatusBadge status={r.status}/></td></tr>)}</tbody></table></div></div>
}
