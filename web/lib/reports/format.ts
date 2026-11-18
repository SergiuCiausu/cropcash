/* How reports write amounts and dates. Same conventions as the pages (web/lib/cc/format.ts):
   a dot between thousands, a comma before bani, a real minus sign. */

const group = (n: number) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MINUS = '−';

/** 1264932 → "12.649,32 lei"; −500 → "−5,00 lei". Exact to the ban, for the accountant. */
export function leiCents(bani: number): string {
  const a = Math.abs(bani);
  return `${bani < 0 ? MINUS : ''}${group(Math.floor(a / 100))},${String(a % 100).padStart(2, '0')} lei`;
}

/** 1264932 → "12.649 lei". To the leu, for the farmer. */
export function leiWhole(bani: number): string {
  return `${bani < 0 ? MINUS : ''}${group(Math.round(Math.abs(bani) / 100))} lei`;
}

/** An amount in a column, or "" when there is none, so empty cells stay empty. */
export const cell = (bani: number) => (bani ? leiCents(bani).replace(' lei', '') : '');

/** "2026-03-15" → "15.03.2026". */
export const dayNumeric = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

/** "2026-03-15" → "15 mar. 2026". */
export const dayWords = (iso: string) => `${+iso.slice(8, 10)} ${SHORT[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

/** 1550 ari → "15,50 ha"; 1500 → "15 ha". */
export const hectares = (ari: number) => `${ari % 100 ? `${group(Math.floor(ari / 100))},${String(ari % 100).padStart(2, '0')}` : group(ari / 100)} ha`;

/** 12050 hundredths → "120,5 l"; 25000 → "250 l". */
export function litres(cl: number): string {
  const whole = group(Math.floor(cl / 100));
  const rest = cl % 100;
  return `${rest ? `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}` : whole} l`;
}
