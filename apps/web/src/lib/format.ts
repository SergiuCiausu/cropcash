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
