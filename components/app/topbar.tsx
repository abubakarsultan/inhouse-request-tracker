'use client';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { CurrentUser } from '@/lib/session';

export default function Topbar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-400">Welcome back</p>
        <p className="font-semibold text-slate-800">{user.name ?? user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        {user.role === 'admin' && (
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">Admin</span>
        )}
        {user.avatar ? (
          <img src={user.avatar} alt="" className="h-9 w-9 rounded-full border" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-sm font-medium text-slate-600">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </div>
        )}
        <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
