export const IDENTITY_STORAGE_KEY = 'inhouse-request-person-name';
export const IDENTITY_EVENT = 'inhouse-request-identity-change';

export function getBrowserIdentityName() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem(IDENTITY_STORAGE_KEY) ?? '').trim();
}

export function setBrowserIdentityName(name: string) {
  if (typeof window === 'undefined') return;
  const clean = name.trim();
  if (clean) window.localStorage.setItem(IDENTITY_STORAGE_KEY, clean);
  else window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail: clean }));
}
