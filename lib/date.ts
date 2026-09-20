// All "today / this month / deadline" logic in this app runs in Asia/Karachi
// (section 3 of the master prompt), regardless of the server's own timezone.

const TZ = 'Asia/Karachi';

function partsInKarachi(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA gives yyyy-mm-dd directly
  return fmt.format(d); // "2026-09-20"
}

/** Today's date in Asia/Karachi, as yyyy-mm-dd. */
export function todayKarachi(): string {
  return partsInKarachi(new Date());
}

/** yyyy-mm-dd for any date, converted into Asia/Karachi. */
export function toKarachiDateString(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return partsInKarachi(date);
}

/** First day (yyyy-mm-01) of the current Karachi month, for "This Month" KPIs. */
export function startOfKarachiMonth(): string {
  const today = todayKarachi();
  return `${today.slice(0, 7)}-01`;
}

/** True if `deadline` (yyyy-mm-dd) is strictly before today in Karachi time. */
export function isOverdueKarachi(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  return deadline < todayKarachi();
}
