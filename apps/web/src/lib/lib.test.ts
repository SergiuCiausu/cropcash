import { describe, expect, it } from 'vitest';
import { fold, formatDayMonth, formatHa, formatLei, parseHa } from './format';
import { failedConditionText } from './subsidyText';

describe('format', () => {
  it('formats lei with Romanian grouping and rounding', () => {
    expect(formatLei(1686960)).toBe('16.870');
    expect(formatLei(1686960, 100)).toBe('16.900');
    expect(formatLei(1265220)).toBe('12.652');
    expect(formatLei(65000)).toBe('650');
  });

  it('formats hectares and dates', () => {
    expect(formatHa(10.01)).toBe('10,01');
    expect(formatDayMonth('2026-10-16')).toBe('16 octombrie');
  });

  it('parses hectares typed with comma or dot', () => {
    expect(parseHa('8')).toBe(8);
    expect(parseHa('8,5')).toBe(8.5);
    expect(parseHa('10.01')).toBe(10.01);
    expect(parseHa('1,234')).toBeNull();
    expect(parseHa('abc')).toBeNull();
    expect(parseHa('')).toBeNull();
  });

  it('folds diacritics for search', () => {
    expect(fold('Argeș')).toBe('arges');
    expect(fold('Dâmbovița')).toBe('dambovita');
  });
});

describe('subsidy reasons', () => {
  it('explains failed rules in plain Romanian', () => {
    expect(failedConditionText({ field: 'age', op: '<', expected: 40, actual: 55 })).toBe(
      'Doar pentru fermierii sub 40 de ani. Tu ai 55.',
    );
    expect(failedConditionText({ field: 'total_ha', op: '<=', expected: 10, actual: 15 })).toBe(
      'Doar pentru fermele de cel mult 10 ha. Tu ai 15 ha.',
    );
    expect(failedConditionText({ field: 'arable_ha', op: '>=', expected: 10.01, actual: 9.5 })).toBe(
      'Trebuie cel puțin 10,01 ha de teren arabil. Tu ai 9,5 ha.',
    );
  });
});
