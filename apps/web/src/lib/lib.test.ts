import { afterAll, describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { displayCurrency, setCurrency, setExchangeRates } from './currency';
import {
  fold,
  formatDayMonth,
  formatHa,
  formatMoney, formatMoneyExact,
  formatOneDecimal,
  formatWeekday,
  nextDayIso,
  parseHa,
} from './format';
import { failedConditionText } from './subsidyText';
import { clearWeatherCache, readCachedWeather } from './weatherCache';

describe('format', () => {
  it('formats lei with Romanian grouping and rounding', () => {
    expect(formatMoney(1686960)).toBe('16.870');
    expect(formatMoney(1686960, 100)).toBe('16.900');
    expect(formatMoney(1265220)).toBe('12.652');
    expect(formatMoney(65000)).toBe('650');
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

describe('weather helpers', () => {
  it('formats forecast days and values', () => {
    expect(formatWeekday('2026-11-08')).toBe('Duminică');
    expect(formatOneDecimal(1.44)).toBe('1,4');
    expect(nextDayIso('2026-11-30')).toBe('2026-12-01');
  });

  const memoryStore = (value: string | null) => {
    let stored = value;
    return {
      getItem: () => stored,
      setItem: (_k: string, v: string) => {
        stored = v;
      },
      removeItem: () => {
        stored = null;
      },
    };
  };
  const copy = JSON.stringify({ countyCode: 'TR', fetchedAt: '2026-11-07T10:00:00.000Z', stale: false, days: [] });

  it('reads the saved copy only for the same county', () => {
    expect(readCachedWeather(memoryStore(copy), 'TR')?.countyCode).toBe('TR');
    expect(readCachedWeather(memoryStore(copy), 'DJ')).toBeNull();
  });

  it('ignores damaged or blocked storage', () => {
    expect(readCachedWeather(memoryStore('{bad'), 'TR')).toBeNull();
    expect(readCachedWeather(memoryStore('{"a":1}'), 'TR')).toBeNull();
    const blocked = {
      ...memoryStore(null),
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readCachedWeather(blocked, 'TR')).toBeNull();
  });

  it('clears the saved copy', () => {
    const store = memoryStore(copy);
    clearWeatherCache(store);
    expect(readCachedWeather(store, 'TR')).toBeNull();
  });
});

describe('currency toggle', () => {
  afterAll(() => setCurrency('RON'));

  it('stays on lei with no rates, even if another currency is chosen', () => {
    setCurrency('EUR');
    expect(displayCurrency()).toBe('RON');
    expect(formatMoney(1686577)).toBe('16.866');
    expect(t('salary.headline', { amount: '850' })).toBe('850 lei pe lună');
  });

  it('shows amounts and their name in the chosen currency, once rates exist', () => {
    setExchangeRates({ date: '2026-11-06', rates: { RON: 5, USD: 1, GBP: 1 } });
    setCurrency('EUR');
    expect(formatMoney(500_000)).toBe('1.000');
    expect(t('salary.headline', { amount: '170' })).toBe('170 euro pe lună');
    expect(formatMoneyExact(525)).toBe('1,05');
  });

  it('rounds a step of 100 lei to the nearest 10 in other currencies', () => {
    expect(formatMoney(1686577, 100)).toBe('3.370');
    setCurrency('RON');
    expect(formatMoney(1686577, 100)).toBe('16.900');
  });

  it('keeps labels that are always in lei', () => {
    setCurrency('GBP');
    expect(t('credit.amount')).toBe('Cât iei (lei)');
    expect(t('onboarding.money.label')).toBe('lei');
  });
});
