/** Pure, testable collaboration rules shared by server and browser. */
export const COLLAB_HEADERS = ['Date', 'Website', 'Placement Page', 'Anchor', 'Target Link', 'Status', 'Exchange ID'] as const;
export const COLLAB_SUMMARY_HEADERS = ['Metric', 'Our Links', 'Partner Links'] as const;
export const COLLAB_STATUSES = ['Pending', 'In Process', 'Live', 'Rejected', 'Cancelled'] as const;
export type CollabStatus = typeof COLLAB_STATUSES[number];
export type CollabDirection = 'given' | 'received';
export type CollabLink = { direction: CollabDirection; status: string; deal_id: string | null };
export type CollabDeal = { id: string; give_required: number; receive_required: number; state: string };

export function cleanTabName(value: string): string {
  return String(value || 'Partner').replace(/[\\/?:*\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Partner';
}
export function partnerTabName(name: string): string {
  const title = cleanTabName(name);
  return title.toLowerCase() === 'rankviz' || title.toLowerCase() === 'summary' ? `${title} Partner` : title;
}
/** Excel worksheet names are limited to 31 chars; Google Sheets allows longer titles. */
export function templatePartnerTabName(name: string): string {
  return partnerTabName(name).slice(0, 31).trim();
}
export function spreadsheetTitle(name: string): string { return `${cleanTabName(name)} - Collaboration`; }
export function quoteA1(tab: string): string { return `'${tab.replace(/'/g, "''")}'`; }
export function normalizeCollabStatus(status: string): CollabStatus | null {
  const input = String(status).trim().toLowerCase();
  return COLLAB_STATUSES.find((item) => item.toLowerCase() === input) ?? (input === 'request shared' ? 'Pending' : null);
}
export function dealProgress(deal: CollabDeal, links: CollabLink[]) {
  const liveGiven = links.filter(link => link.deal_id === deal.id && link.direction === 'given' && link.status === 'Live').length;
  const liveReceived = links.filter(link => link.deal_id === deal.id && link.direction === 'received' && link.status === 'Live').length;
  return {
    liveGiven, liveReceived,
    giveRemaining: Math.max(0, deal.give_required - liveGiven),
    receiveRemaining: Math.max(0, deal.receive_required - liveReceived),
    completed: deal.state !== 'cancelled' && liveGiven >= deal.give_required && liveReceived >= deal.receive_required,
  };
}
export function partnerMetrics(deals: CollabDeal[], links: CollabLink[]) {
  const activeDeals = deals.filter(deal => deal.state !== 'cancelled');
  const progress = activeDeals.map(deal => dealProgress(deal, links));
  return {
    givenLive: links.filter(x => x.direction === 'given' && x.status === 'Live').length,
    receivedLive: links.filter(x => x.direction === 'received' && x.status === 'Live').length,
    pending: links.filter(x => x.status === 'Pending').length,
    inProcess: links.filter(x => x.status === 'In Process').length,
    rejected: links.filter(x => x.status === 'Rejected').length,
    openDeals: progress.filter(x => !x.completed).length,
    completedDeals: progress.filter(x => x.completed).length,
    givenOutstanding: progress.reduce((s, x) => s + x.giveRemaining, 0),
    receivedOutstanding: progress.reduce((s, x) => s + x.receiveRemaining, 0),
  };
}
export function validateCollabHeaders(row: unknown[]): boolean {
  return COLLAB_HEADERS.every((heading, index) => String(row[index] ?? '').replace(/^\uFEFF/, '').trim().toLowerCase() === heading.toLowerCase());
}
