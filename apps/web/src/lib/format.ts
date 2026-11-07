const intRo = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const haRo = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Bani -> "16.900" (lei, no decimals), optionally rounded to the nearest `step` lei. */
export function formatLei(bani: number, step = 1): string {
  const lei = bani / 100;
  return intRo.format(Math.round(lei / step) * step);
}

/** Hectares with up to 2 decimals and a comma: 10.01 -> "10,01". */
export function formatHa(ha: number): string {
  return haRo.format(ha);
}

/** "2026-10-16" -> "16 octombrie". */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

const monthYear = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOnly = new Intl.DateTimeFormat('ro-RO', { month: 'long', timeZone: 'UTC' });

/** "2026-11" -> "Noiembrie 2026". */
export function formatMonthYear(key: string): string {
  const s = monthYear.format(new Date(`${key}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2027-04" -> "aprilie 2027" (inside a sentence). */
export function formatMonthYearLower(key: string): string {
  return monthYear.format(new Date(`${key}-01T00:00:00Z`));
}

/** "2027-05" -> "mai". */
export function formatMonth(key: string): string {
  return monthOnly.format(new Date(`${key}-01T00:00:00Z`));
}

const monthShort = new Intl.DateTimeFormat('ro-RO', { month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });

/** "2026-11" -> "nov." (chart axis). */
export function formatMonthShort(key: string): string {
  return monthShort.format(new Date(`${key}-01T00:00:00Z`));
}

/** "2027-05" -> "Mai". */
export function formatMonthCap(key: string): string {
  const s = formatMonth(key);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Today as "7 noiembrie 2026". */
export function formatToday(now = new Date()): string {
  return fullDate.format(now);
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayIso(now = new Date()): string {
  return `${currentMonthKey(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Current month as "YYYY-MM" in local time. */
export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Parses "8", "8,5" or "8.5" -> 8.5; returns null for invalid input. */
export function parseHa(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Lowercase, no diacritics: for searching county names. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
