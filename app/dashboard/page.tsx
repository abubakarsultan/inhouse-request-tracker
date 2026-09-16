const cards=[
'Total Requests',
'Live Links',
'Pending',
'Projects'
];

export default function Dashboard(){
return <main className="p-10">
<h1 className="text-3xl font-bold">Dashboard</h1>
<div className="grid grid-cols-4 gap-5 mt-8">
{cards.map(c=>
<div key={c} className="bg-white p-6 rounded-xl shadow">
{c}
</div>)}
</div>
</main>
}
