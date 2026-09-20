import { NextResponse } from 'next/server';
import { adminClient, ADMIN_EMAIL } from '@/lib/supabase-admin';

// ONE-TIME SETUP ROUTE. Creates the single admin account (or resets its
// password if it already exists) using ADMIN_EMAIL / ADMIN_PASSWORD from
// the environment. Protected by SETUP_SECRET so it can't be triggered by
// anyone else — set SETUP_SECRET in Vercel, call this once, then delete
// this file (or unset SETUP_SECRET) so it can't be called again.
//
// Usage (from a terminal, once, after deploying):
//   curl -X POST https://your-app.vercel.app/api/admin/seed \
//     -H "x-setup-key: <SETUP_SECRET value>"

export async function POST(request: Request) {
  const key = request.headers.get('x-setup-key');
  if (!process.env.SETUP_SECRET || key !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not set in the environment.' }, { status: 500 });
  }

  const { data: list, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const existing = list.users.find((u) => (u.email || '').toLowerCase() === ADMIN_EMAIL);
  let userId: string;

  if (existing) {
    const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (updateError || !updated.user) {
      return NextResponse.json({ error: updateError?.message ?? 'Could not update the account.' }, { status: 500 });
    }
    userId = updated.user.id;
  } else {
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? 'Could not create the account.' }, { status: 500 });
    }
    userId = created.user.id;
  }

  const { error: upsertError } = await adminClient.from('users').upsert({
    id: userId,
    email: ADMIN_EMAIL,
    name: 'Abubakar Sultan',
    avatar: null,
    role: 'admin',
    active: true,
  });
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: existing ? 'Password updated.' : 'Admin account created.' });
}
