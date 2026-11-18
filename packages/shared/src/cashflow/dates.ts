/** Date helpers on plain ISO strings (YYYY-MM-DD / YYYY-MM). No time zones involved. */

export type IsoDate = string;
export type MonthKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function monthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthOf(key: MonthKey): number {
  return Number(key.slice(5, 7));
}

export function firstDay(key: MonthKey): IsoDate {
  return `${key}-01`;
}

export function lastDay(key: MonthKey): IsoDate {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${pad(d)}`;
}

export function dayInMonth(key: MonthKey, day: number): IsoDate {
  return `${key}-${pad(day)}`;
}

export function addYears(date: IsoDate, n: number): IsoDate {
  return `${Number(date.slice(0, 4)) + n}${date.slice(4)}`;
}

function toUtc(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function midpoint(start: IsoDate, end: IsoDate): IsoDate {
  const t = (toUtc(start) + toUtc(end)) / 2;
  return new Date(t).toISOString().slice(0, 10);
}

/** ISO dates compare correctly as strings. */
export const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/** Today's date in Romania, for servers whose clock isn't on Romanian time. */
export function todayInRomania(now: Date): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
