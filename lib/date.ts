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
