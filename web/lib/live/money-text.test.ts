import { describe, expect, it } from 'vitest';
import { convertText } from './money-text';

const rates = { date: '2026-11-07', rates: { RON: 5, USD: 1.25, GBP: 0.8 } };

describe('amounts in another currency', () => {
  it('leaves lei alone', () => {
    expect(convertText('2.500 lei', 'RON', rates)).toBe('2.500 lei');
  });

  it('rewrites each amount in a sentence', () => {
    expect(convertText('Următorii bani: 12.500 lei, apoi 500 lei pe lună', 'EUR', rates)).toBe('Următorii bani: 2.500 €, apoi 100 € pe lună');
  });

  it('handles millions, signs and other currencies', () => {
    expect(convertText('−1.000.000 lei', 'USD', rates)).toBe('−250.000 $');
    expect(convertText('+500 lei', 'GBP', rates)).toBe('+80 £');
  });

  it('keeps decimals when the amount had them', () => {
    expect(convertText('1,25 lei', 'EUR', rates)).toBe('0,25 €');
    expect(convertText('1,5 lei', 'EUR', rates)).toBe('0,30 €');
  });

  it('leaves prices per kilo and words alone', () => {
    expect(convertText('la 1,20 lei/kg', 'EUR', rates)).toBe('la 1,20 lei/kg');
    expect(convertText('Suma, în lei', 'EUR', rates)).toBe('Suma, în lei');
    expect(convertText('7 leii', 'EUR', rates)).toBe('7 leii');
  });

  it('converts both ends of a range that says lei once', () => {
    expect(convertText('între 15.200 și 17.100 lei', 'EUR', rates)).toBe('între 3.040 € și 3.420 €');
    expect(convertText('de la 450 la 1.250 lei', 'EUR', rates)).toBe('de la 90 € la 250 €');
    expect(convertText('15.200–17.100 lei', 'EUR', rates)).toBe('3.040 €–3.420 €');
    expect(convertText('1,10 - 1,50 lei', 'EUR', rates)).toBe('0,22 € - 0,30 €');
  });

  it('leaves numbers that are not amounts alone', () => {
    expect(convertText('15 ha și 500 lei', 'EUR', rates)).toBe('15 ha și 100 €');
    expect(convertText('între 1,10 și 1,50 lei/kg', 'EUR', rates)).toBe('între 1,10 și 1,50 lei/kg');
  });

  it('is safe to run twice', () => {
    const once = convertText('500 lei', 'EUR', rates);
    expect(convertText(once, 'EUR', rates)).toBe(once);
  });
});
