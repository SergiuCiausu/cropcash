import { describe, expect, it } from 'vitest';
import { about, between, cents, date, daysLeft, eurShort, exact, failText, group, ha, num, signedLei, zile } from './format';
import { moneyFormat } from './currency';

describe('format', () => {
  it('writes amounts the way the pages do', () => {
    expect(group(1234567)).toBe('1.234.567');
    expect(group(-950)).toBe('950');
    expect(cents(1264932)).toBe('12.649,32');
    expect(cents(5)).toBe('0,05');
    expect(exact(1264932)).toBe('12.649');
    expect(about(1264932)).toBe('12.600');
    expect(signedLei(-120000)).toBe('−1.200 lei');
    expect(signedLei(120000)).toBe('1.200 lei');
  });

  it('writes areas, decimals and budgets', () => {
    expect(ha(1500)).toBe('15');
    expect(ha(1550)).toBe('15,50');
    expect(num(2.5)).toBe('2,5');
    expect(eurShort(2_500_000)).toBe('2,5 mil. €');
    expect(eurShort(450_000)).toBe('450.000 €');
    expect(eurShort(null)).toBeNull();
  });

  it('writes dates and day counts', () => {
    expect(date('2026-11-05')).toBe('5 nov.');
    expect(date('2026-11-05', true)).toBe('5 nov. 2026');
    expect(daysLeft('2026-12-01', '2026-11-15')).toBe(16);
    expect(daysLeft('2026-11-01', '2026-11-15')).toBe(-14);
    expect(zile(1)).toBe('1 zi');
    expect(zile(5)).toBe('5 zile');
    expect(zile(21)).toBe('21 de zile');
    expect(between({ start: '2026-10-16', end: '2026-11-30' }, '2026-11-15')).toBe('Între 16 oct. și 30 nov.');
    expect(between({ start: '2026-12-01', end: '2027-06-30' }, '2026-11-15')).toBe('Între 1 dec. și 30 iun. 2027');
  });

  it('says why a save failed', () => {
    expect(failText({ code: 'offline' }, true)).toMatch(/nu ai internet/);
    expect(failText({ status: 0, code: 'network' }, false)).toMatch(/nu ai internet/);
    expect(failText(new Error('x'), true)).toBe('Nu am putut salva. Încearcă din nou.');
  });
});

describe('moneyFormat', () => {
  it('prints lei when there are no rates', () => {
    const m = moneyFormat({ code: 'EUR', rates: null });
    expect(m.lei(1264932)).toBe('12.649 lei');
  });

  it('converts with the same rules as the legacy text rewrite', () => {
    const rates = { date: '2026-11-07', rates: { RON: 5, USD: 1.1, GBP: 0.85 } };
    const m = moneyFormat({ code: 'EUR', rates: rates as never });
    expect(m.lei(1_000_000)).toBe('2.000 €');
    expect(m.text('Primești 10.000 lei, la 1,20 lei/kg')).toBe('Primești 2.000 €, la 1,20 lei/kg');
  });
});
