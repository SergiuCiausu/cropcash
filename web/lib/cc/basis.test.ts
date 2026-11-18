import { describe, expect, it } from 'vitest';
import { basisEcho, flipText, leiPerHaFrom, loadBasis, saveBasis, shownBani, tonnesFrom, totalBaniFrom, tPerHaFrom } from './basis';
import { memoryStore } from './storage';

describe('reading a figure typed in either unit', () => {
  it('keeps lei/ha as typed, and splits a total by the hectares', () => {
    expect(leiPerHaFrom('1.900', 'ha', 1600)).toBe(1900);
    expect(leiPerHaFrom('30.400', 'total', 1600)).toBe(1900);
    expect(leiPerHaFrom('30.304', 'total', 1600)).toBe(1894);
  });

  it('turns lei/ha into the total for the hectares', () => {
    expect(totalBaniFrom('800', 'ha', 750)).toBe(600_000);
    expect(totalBaniFrom('12.500', 'total', 0)).toBe(1_250_000);
  });

  it('has nothing to split by without hectares', () => {
    expect(leiPerHaFrom('30.400', 'total', 0)).toBeNull();
    expect(totalBaniFrom('800', 'ha', 0)).toBeNull();
    expect(tPerHaFrom('80', 'total', 0)).toBeNull();
  });

  it('refuses what it cannot read', () => {
    expect(leiPerHaFrom('12,5', 'ha', 1600)).toBeNull();
    expect(tPerHaFrom('mult', 'ha', 1600)).toBeNull();
  });

  it('reads tonnes both ways', () => {
    expect(tPerHaFrom('80', 'total', 1600)).toBe(5);
    expect(tPerHaFrom('4,5', 'ha', 1600)).toBe(4.5);
    expect(tonnesFrom('5', 'ha', 1600)).toBe(80);
    expect(tonnesFrom('86,9', 'total', 1600)).toBe(86.9);
  });
});

describe('flipping the switch', () => {
  it('keeps the same amount', () => {
    expect(flipText('1.900', 'lei', 'ha', 1600)).toBe('30.400');
    expect(flipText('30.400', 'lei', 'total', 1600)).toBe('1.900');
    expect(flipText('5', 'tonnes', 'ha', 1600)).toBe('80');
    expect(flipText('80', 'tonnes', 'total', 1600)).toBe('5');
  });

  it('leaves empty, unreadable or unsplittable text alone', () => {
    expect(flipText('', 'lei', 'ha', 1600)).toBe('');
    expect(flipText('mult', 'lei', 'ha', 1600)).toBe('mult');
    expect(flipText('1.900', 'lei', 'ha', 0)).toBe('1.900');
  });
});

describe('the line under a field', () => {
  it('says both units, as they will be saved', () => {
    expect(basisEcho('1.900', 'lei', 'ha', 1600, 'ha')).toBe('Adică 1.900 lei/ha × 16 ha = 30.400 lei');
    expect(basisEcho('30.304', 'lei', 'total', 1600, 'ha')).toBe('Salvăm 1.894 lei/ha × 16 ha = 30.304 lei');
    expect(basisEcho('800', 'lei', 'ha', 750, 'total')).toBe('Adică 800 lei/ha × 7,50 ha = 6.000 lei');
    expect(basisEcho('12.000', 'lei', 'total', 1500, 'total')).toBe('Adică 12.000 lei (800 lei/ha pe 15 ha)');
    expect(basisEcho('80', 'tonnes', 'total', 1600, 'ha')).toBe('Salvăm 5 t/ha × 16 ha = 80 t');
  });

  it('says nothing for an empty field or without hectares', () => {
    expect(basisEcho('', 'lei', 'ha', 1600, 'ha')).toBe('');
    expect(basisEcho('800', 'lei', 'ha', 0, 'total')).toBe('');
  });
});

describe('showing results', () => {
  it('divides by the hectares only when asked and when there are some', () => {
    expect(shownBani(3_040_000, 1600, 'ha')).toEqual({ bani: 190_000, perHa: true });
    expect(shownBani(3_040_000, 1600, 'total')).toEqual({ bani: 3_040_000, perHa: false });
    expect(shownBani(3_040_000, 0, 'ha')).toEqual({ bani: 3_040_000, perHa: false });
  });

  it('keeps the choice, and ignores anything else saved under the key', () => {
    const store = memoryStore({ 'cropcash-basis': 'nonsense' });
    expect(loadBasis(store, 'cropcash-basis')).toBeNull();
    saveBasis(store, 'cropcash-basis', 'ha');
    expect(loadBasis(store, 'cropcash-basis')).toBe('ha');
  });
});
