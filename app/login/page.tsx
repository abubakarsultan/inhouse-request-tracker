'use client';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  domain: 'Only @rankviz.com accounts can sign in.',
  disabled: 'Your account has been deactivated. Contact an admin.',
  auth: 'Sign-in failed. Please try again.',
};

function isRankvizEmail(email: string) {
  return email.toLowerCase().trim().endsWith('@rankviz.com');
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get('error');

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { hd: 'rankviz.com' } },
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!isRankvizEmail(trimmedEmail)) {
      setFormError('Only @rankviz.com email addresses are allowed.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    if (mode === 'signup') {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, name: name.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(json.error ?? 'Could not create account.');
        setLoading(false);
        return;
      }
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setFormError(
        mode === 'signup'
          ? 'Account created, but sign-in failed — please try signing in.'
          : 'Incorrect email or password.'
      );
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

        <button
          onClick={loginWithGoogle}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-800"
        >
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs font-medium text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          OR
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          )}
          <input
            type="email"
            placeholder="you@rankviz.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setFormError(null);
          }}
          className="mt-4 text-xs font-medium text-indigo-600 hover:underline"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>

        <p className="mt-4 text-xs text-slate-400">Restricted to @rankviz.com accounts</p>
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
