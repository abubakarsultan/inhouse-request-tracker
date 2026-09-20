'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { createAuthBrowserClient } from '@/lib/supabase-browser';

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    window.location.assign('/login');
  }
  return <button type="button" onClick={logout} disabled={pending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--canvas)] disabled:opacity-50"><LogOut size={15} />{compact ? 'Logout' : pending ? 'Signing out…' : 'Logout'}</button>;
}
