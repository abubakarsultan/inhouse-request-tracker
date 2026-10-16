/** Validate actual Google Sheets links. Never accept arbitrary URLs or IDs from a form. */
export function parseGoogleSheetUrl(raw: string): { spreadsheetId: string; gid: number | null } {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('Paste the full Google Sheets URL, starting with https://docs.google.com/spreadsheets/d/'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    throw new Error('Only https://docs.google.com Google Sheets links are supported.');
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!match) throw new Error('Invalid Google Sheets URL. Open the spreadsheet and copy its address.');
  // Google Sheets usually encodes gid in the fragment; support ?gid too.
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const gidText = fragment.get('gid') ?? url.searchParams.get('gid');
  if (gidText != null && !/^\d+$/.test(gidText)) throw new Error('The Google Sheet tab identifier is invalid.');
  const gid = gidText == null ? null : Number(gidText);
  if (gid != null && !Number.isSafeInteger(gid)) throw new Error('The Google Sheet tab identifier is invalid.');
  return { spreadsheetId: match[1], gid };
}

export function buildGoogleSheetUrl(spreadsheetId: string, gid?: number | null): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit${gid == null ? '' : `#gid=${gid}`}`;
}
