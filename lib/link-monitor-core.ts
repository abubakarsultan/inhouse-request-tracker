/** Deterministic link matching; never treat text mentions as a verified hyperlink. */
export function normalizeLinkUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
function decodeEntities(text: string) {
  return text.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_all, n: string) => String.fromCharCode(Number(n)));
}
export function findPlacedLink(html: string, pageUrl: string, targetUrl: string, expectedAnchor: string) {
  const expected = normalizeLinkUrl(targetUrl);
  if (!expected) return { matched: false, detail: 'Target URL is invalid', anchor: '', target: '' };
  const anchorTags = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const match of anchorTags) {
    const hrefMatch = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
    if (!href) continue;
    let absolute = '';
    try { absolute = new URL(decodeEntities(href), pageUrl).toString(); } catch { continue; }
    if (normalizeLinkUrl(absolute) !== expected) continue;
    const anchor = decodeEntities(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const matched = anchor.toLowerCase().trim() === expectedAnchor.toLowerCase().trim();
    return { matched, detail: matched ? 'Target and anchor verified' : 'Target found, but anchor text differs', anchor, target: absolute };
  }
  return { matched: false, detail: 'No matching hyperlink to target found', anchor: '', target: '' };
}
export function isBlockedIp(ip: string) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('::ffff:');
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a,b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 || a === 198 && (b === 18 || b === 19);
}
