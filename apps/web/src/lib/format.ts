import { displayCurrency, toDisplay } from './currency';

const intRo = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const haRo = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Bani -> "16.900" in the display currency, no decimals, optionally rounded to the nearest
 * `step` lei. Amounts in the other currencies are about a fifth as large, so a step of
 * 100 lei rounds to the nearest 10 there.
 */
/** Always in lei, for texts that say "lei" themselves. */
export function formatLei(bani: number, step = 1): string {
  return intRo.format(Math.round(bani / 100 / step) * step);
}

export function formatMoney(bani: number, step = 1): string {
  const whole = toDisplay(bani) / 100;
  const nearest = displayCurrency() === 'RON' ? step : Math.max(1, step / 10);
  return intRo.format(Math.round(whole / nearest) * nearest);
}

/** Bani -> "1,05", for small prices, in the display currency. */
export function formatMoneyExact(bani: number): string {
  return (toDisplay(bani) / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Hectares with up to 2 decimals and a comma: 10.01 -> "10,01". */
export function formatHa(ha: number): string {
  return haRo.format(ha);
}

/** "2026-10-16" -> "16 octombrie". */
/** An official amount in euro, whole. It stays in euro whatever the currency toggle says. */
export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

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
const fullDateUtc = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

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

/** "2026-11-07" -> "7 noiembrie 2026". */
export function formatDayMonthYear(iso: string): string {
  return fullDateUtc.format(new Date(`${iso}T00:00:00Z`));
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

const weekday = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', timeZone: 'UTC' });
const oneDecimal = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

/** "2026-11-08" -> "Duminică". */
export function formatWeekday(iso: string): string {
  const s = weekday.format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1.44 -> "1,4". */
export function formatOneDecimal(n: number): string {
  return oneDecimal.format(n);
}

/** "2026-11-30" -> "2026-12-01". */
export function nextDayIso(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Lowercase, no diacritics: for searching county names. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
