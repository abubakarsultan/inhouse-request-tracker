// Ported from the Apps Script's norm_(): lowercase, strip everything
// except [a-z0-9]. Used for the duplicate rule (approved site + anchor).
export function norm(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Section 6.3 — Site Check must extract a real host instead of the old
// substring match (which false-positived example.co against example.com).
// Strips protocol, "www.", path, query string, and port; lowercases;
// treats "www.x.com" the same as "x.com".
export function extractHost(input: string | null | undefined): string {
  let s = String(input ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, ''); // strip protocol
  s = s.split('/')[0]; // strip path
  s = s.split('?')[0]; // strip query (in case protocol was absent)
  s = s.split('#')[0];
  s = s.split(':')[0]; // strip port
  s = s.replace(/^www\./, '');
  return s;
}

export function hostsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ha = extractHost(a);
  const hb = extractHost(b);
  return Boolean(ha) && ha === hb;
}
