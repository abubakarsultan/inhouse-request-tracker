const stats=[
'Total Requests',
'Live Links',
'Pending',
'Removed',
'Projects'
];

export default function Dashboard(){
return <main className="p-10 ml-60">
<h1 className="text-3xl font-bold">Dashboard</h1>
<div className="grid grid-cols-5 gap-4 mt-8">
{stats.map(s=>
<div key={s} className="rounded-xl bg-white shadow p-5">{s}</div>
)}
</div>
</main>
}
