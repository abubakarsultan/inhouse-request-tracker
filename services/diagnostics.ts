'use server';

import { adminClient } from '@/lib/supabase-admin';
import { checkTeamSheetConnection } from '@/services/google-sheet-sync';
import { requireAdminForAction } from '@/lib/auth';

export type DiagnosticItem = {
  key: 'supabase' | 'auth' | 'adminEmails' | 'serviceAccount' | 'teamSheet' | 'webhookSecret';
  label: string;
  ok: boolean;
  detail: string;
};

export async function getConnectionDiagnostics(): Promise<DiagnosticItem[]> {
  await requireAdminForAction();
  const items: DiagnosticItem[] = [];

  try {
    const { error } = await adminClient.from('projects').select('id').limit(1);
    if (error) throw error;
    items.push({ key: 'supabase', label: 'Supabase', ok: true, detail: 'Service-role database connection is working.' });
  } catch (error) {
    items.push({ key: 'supabase', label: 'Supabase', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }


  const authOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
  items.push({ key: 'auth', label: 'Google login client', ok: authOk, detail: authOk ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is configured for Supabase Auth.' : 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured.' });

  const adminEmails = String(process.env.ADMIN_EMAILS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  items.push({ key: 'adminEmails', label: 'Bootstrap admins', ok: adminEmails.length > 0, detail: adminEmails.length ? `${adminEmails.length} ADMIN_EMAILS entr${adminEmails.length === 1 ? 'y is' : 'ies are'} configured.` : 'ADMIN_EMAILS is empty. The first Rankviz user can bootstrap as admin, but set this before team rollout.' });

  const serviceAccountConfigured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
  let serviceAccountDetail = serviceAccountConfigured ? 'Base64 service-account JSON is configured.' : 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.';
  if (serviceAccountConfigured) {
    try {
      JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!, 'base64').toString('utf8'));
    } catch {
      serviceAccountDetail = 'GOOGLE_SERVICE_ACCOUNT_JSON is present but is not valid base64-encoded JSON.';
    }
  }
  const serviceAccountOk = serviceAccountConfigured && serviceAccountDetail.startsWith('Base64');
  items.push({ key: 'serviceAccount', label: 'Sheets service account', ok: serviceAccountOk, detail: serviceAccountDetail });

  const sheet = await checkTeamSheetConnection();
  items.push({ key: 'teamSheet', label: 'Team sheet', ok: sheet.ok, detail: sheet.detail });

  const secretOk = Boolean(process.env.SHEET_WEBHOOK_SECRET?.trim());
  items.push({
    key: 'webhookSecret',
    label: 'Webhook secret',
    ok: secretOk,
    detail: secretOk ? 'SHEET_WEBHOOK_SECRET is configured.' : 'SHEET_WEBHOOK_SECRET is not configured.',
  });

  return items;
}
