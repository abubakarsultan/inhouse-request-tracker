const KARACHI_TIME_ZONE = 'Asia/Karachi';

export function karachiDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KARACHI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function karachiDateOffsetString(days: number, date = new Date()) {
  const today = karachiDateString(date);
  const shifted = new Date(`${today}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function karachiMonthBounds(date = new Date()) {
  const today = karachiDateString(date);
  const [year, month] = today.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    start: `${year}-${pad(month)}-01T00:00:00+05:00`,
    end: `${nextYear}-${pad(nextMonth)}-01T00:00:00+05:00`,
  };
}

export function formatKarachiDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KARACHI_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export type DeadlineTone = 'overdue' | 'soon' | 'normal';

export function deadlineTone(deadline: string | null | undefined, status: string, today = karachiDateString()): DeadlineTone {
  if (!deadline || status !== 'Request shared') return 'normal';
  const clean = String(deadline).slice(0, 10);
  if (clean < today) return 'overdue';
  const soonEnd = (() => {
    const shifted = new Date(`${today}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + 2);
    return shifted.toISOString().slice(0, 10);
  })();
  return clean <= soonEnd ? 'soon' : 'normal';
}

export function deadlineCellClass(deadline: string | null | undefined, status: string, today = karachiDateString()) {
  const tone = deadlineTone(deadline, status, today);
  if (tone === 'overdue') return 'bg-[#f4c7c3] text-[#8a1c16]';
  if (tone === 'soon') return 'bg-[#fff2cc] text-[#7a5400]';
  return 'text-[var(--muted)]';
}
