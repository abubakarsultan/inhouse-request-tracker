export const RANKVIZ_DOMAIN = 'rankviz.com';

export function isRankvizEmail(email: string | null | undefined) {
  const clean = String(email ?? '').trim().toLowerCase();
  return clean.endsWith(`@${RANKVIZ_DOMAIN}`) && clean.split('@').length === 2;
}

export function parseAdminEmails(value: string | null | undefined) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((email) => isRankvizEmail(email))
  );
}
