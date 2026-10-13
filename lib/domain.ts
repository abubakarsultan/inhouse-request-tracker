export function extractHost(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(candidate);
    let host = parsed.hostname.trim().toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    host = host.replace(/\.+$/, '');
    return host || null;
  } catch {
    return null;
  }
}

export function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
