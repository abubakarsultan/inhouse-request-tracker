import Link from 'next/link';
import {LayoutDashboard,FolderKanban,ListTodo,Upload,Settings} from 'lucide-react';
const links=[['Dashboard','/dashboard',LayoutDashboard],['Projects','/projects',FolderKanban],['Requests','/requests',ListTodo],['Import','/import',Upload],['Settings','/settings',Settings]];
export default function Sidebar(){return <aside className="fixed left-0 top-0 hidden h-screen w-64 bg-white border-r p-5 lg:block"><h1 className="text-xl font-bold text-blue-700 mb-8">INHOUSE REQUEST</h1>{links.map(([t,u,I]:any)=><Link key={u} href={u} className="flex gap-3 p-3 rounded-lg hover:bg-slate-100"><I size={18}/>{t}</Link>)}</aside>}
