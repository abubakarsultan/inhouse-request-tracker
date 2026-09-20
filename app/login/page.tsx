'use client';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

const ADMIN_EMAIL = 'abubakarsultan@rankviz.com';

const ERRORS: Record<string, string> = {
  disabled: 'This account has been deactivated.',
  auth: 'Sign-in failed. Please try again.',
};

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get('error');

  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });

    if (signInError) {
      setFormError('Incorrect password.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-indigo-50 via-white to-slate-50">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl shadow-slate-200/50">
        <h1 className="text-2xl font-bold text-indigo-700">INHOUSE REQUEST</h1>
        <p className="mt-1 text-sm text-slate-400">Rankviz outreach operations</p>

        {urlError && (
          <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">
            {ERRORS[urlError] ?? 'Something went wrong.'}
          </p>
        )}
        {formError && <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">{formError}</p>}

        <form onSubmit={handleSubmit} className="mt-8 space-y-3 text-left">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              value={ADMIN_EMAIL}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400">Single-admin access only</p>
      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
