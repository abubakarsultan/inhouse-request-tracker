const cards=['Total Requests','Live Links','Pending Requests','Removed Links','Total Projects'];
export default function Dashboard(){return <><h1 className="text-3xl font-bold mb-6">Dashboard</h1><div className="grid md:grid-cols-5 gap-4">{cards.map(c=><div className="card" key={c}><p className="text-sm text-slate-500">{c}</p><strong className="text-3xl">0</strong></div>)}</div></>}
