import { convertAmount, type CurrencyCode, type ExchangeRates } from '../../../packages/shared/src/currency/index';

const SYMBOL: Record<Exclude<CurrencyCode, 'RON'>, string> = { EUR: '€', USD: '$', GBP: '£' };
/** "12.649 lei" and "1,25 lei", but not "lei/kg", which is a price the farmer compares in lei. */
const AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))? lei(?![\p{L}/])/gu;
/**
 * The first number of a range that says "lei" only once: "între 15.200 și 17.100 lei",
 * "de la 450 la 1.250 lei", "15.200–17.100 lei". It gets its own currency sign.
 */
const RANGE_START = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?=(?: și | la |\s?[–-]\s?)(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})? lei(?![\p{L}/]))/gu;
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Rewrites the amounts in a piece of page text. Display only: everything is still calculated and
 * saved in lei, and form fields hold values rather than text, so they stay in lei.
 */
export function convertText(text: string, code: CurrencyCode, rates: ExchangeRates): string {
  if (code === 'RON') return text;
  const convert = (whole: string, part: string | undefined) => {
    const bani = Number(whole.replaceAll('.', '')) * 100 + Number((part ?? '').padEnd(2, '0'));
    const minor = convertAmount(bani, 'RON', code, rates);
    const shown = part
      ? `${grouped(Math.floor(minor / 100))},${String(minor % 100).padStart(2, '0')}`
      : grouped(Math.round(minor / 100));
    return `${shown} ${SYMBOL[code]}`;
  };
  return text
    .replace(RANGE_START, (_all, whole: string, part: string | undefined) => convert(whole, part))
    .replace(AMOUNT, (_all, whole: string, part: string | undefined) => convert(whole, part));
}
