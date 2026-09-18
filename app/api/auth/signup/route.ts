import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, isRankvizEmail, isAdminEmail } from '@/lib/supabase-admin';

// This runs with the service-role key, so it is the ONLY place account
// creation should happen. In the Supabase dashboard, turn OFF
// "Allow new users to sign up" under Authentication -> Providers -> Email —
// that closes the public signUp() endpoint (callable with just the anon
// key) so every account is created here, where the @rankviz.com check is
// enforced server-side and cannot be bypassed from the browser console.

const signupSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  name: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }

  const { password, name } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  if (!isRankvizEmail(email)) {
    return NextResponse.json({ error: 'Only @rankviz.com email addresses can sign up.' }, { status: 403 });
  }

  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Try signing in instead.' },
      { status: 409 }
    );
  }

  // email_confirm: true — this is an internal team tool, so we skip the
  // email-verification link and let the account sign in immediately.
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? 'Could not create account.' }, { status: 400 });
  }

  const { error: profileError } = await adminClient.from('users').insert({
    id: created.user.id,
    email,
    name: name || email.split('@')[0],
    avatar: null,
    role: isAdminEmail(email) ? 'admin' : 'member',
  });

  if (profileError) {
    // Roll back the auth user so we don't end up with an orphaned login
    // that has no profile row (which would just bounce at every page).
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: 'Could not finish setting up the account. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
