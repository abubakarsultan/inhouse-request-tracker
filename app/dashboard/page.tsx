const cards=['Total Requests','Live Links','Pending','Projects'];

export default function Dashboard(){
return <main className="ml-64 p-10">
<h1 className="text-3xl font-bold">Dashboard</h1>
<div className="grid grid-cols-4 gap-5 mt-8">
{cards.map(x=><div key={x} className="bg-white rounded-xl shadow p-6">{x}</div>)}
</div>
</main>
}
