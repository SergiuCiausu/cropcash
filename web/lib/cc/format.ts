/* How amounts, areas and dates are written on every page. Same output as web/legacy/app.js.
   Money is in bani (integers). These print lei; useMoney() converts them for the currency toggle. */
import { failText as sharedFailText } from '../live/fail-text';

export const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'] as const;

/** 12345 → "12.345". The sign is dropped; callers add it. */
export const group = (n: number) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 1264932 bani → "12.649,32". */
export const cents = (bani: number) => {
  const a = Math.abs(bani);
  return `${group(Math.floor(a / 100))},${String(a % 100).padStart(2, '0')}`;
};

/** Headline amounts, rounded to 100 lei: the farmer needs the size, not the cents. */
export const about = (bani: number) => group(Math.round(bani / 10000) * 100);

/** Exact to the leu, so an advance and a balance visibly add up. */
export const exact = (bani: number) => group(Math.round(bani / 100));

/** "−1.200 lei" or "1.200 lei". */
export const signedLei = (bani: number) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;

/** 1550 ari → "15,50"; 1500 ari → "15". */
export const ha = (ari: number) => (ari % 100 ? `${group(Math.floor(ari / 100))},${String(ari % 100).padStart(2, '0')}` : group(ari / 100));

/** A decimal with a Romanian comma. */
export const num = (v: number | string) => String(v).replace('.', ',');

/** Official call budgets: "2,5 mil. €" or "450.000 €". */
export const eurShort = (n: number | null | undefined) => {
  if (n == null) return null;
  if (n >= 1e6) return `${num(Math.round(n / 1e5) / 10)} mil. €`;
  return `${group(n)} €`;
};

/** "2026-11-15" → "15 nov." or "15 nov. 2026". */
export const date = (iso: string, withYear = false) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
};

const dayNo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};

/** Days from today to a date; negative when it has passed. */
export const daysLeft = (iso: string, today: string) => dayNo(iso) - dayNo(today);

/** "1 zi", "5 zile", "20 de zile". */
export const zile = (n: number) => (n === 1 ? '1 zi' : `${n} ${n >= 20 ? 'de ' : ''}zile`);

/** "Între 16 oct. și 30 nov." The year shows when it isn't this year. */
export const between = (w: { start: string; end: string }, today: string) =>
  `Între ${date(w.start)} și ${date(w.end, w.end.slice(0, 4) !== today.slice(0, 4))}`;

/** Text that failed to save, in the words every page uses. */
/** The sentence for a failed change, from the one list every page shares. Money is worded differently. */
export const failText = (e: unknown, online: boolean) => sharedFailText(e, (e as { moneyMove?: boolean } | null)?.moneyMove ? 'money' : 'record', online);
