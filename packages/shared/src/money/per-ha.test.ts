import { describe, expect, it } from 'vitest';
import { baniToPerHaLei, perHaBani, perHaToBani, perHaToTonnes, tonnesToPerHa } from './index';

describe('per hectare or total', () => {
  it('turns lei/ha into exact bani for the area', () => {
    expect(perHaToBani(1900, 1600)).toBe(3_040_000); // 1.900 lei/ha × 16 ha = 30.400 lei
    expect(perHaToBani(800, 750)).toBe(600_000); // 7,5 ha
    expect(perHaToBani(0, 1600)).toBe(0);
  });

  it('round-trips per-ha -> total -> per-ha exactly', () => {
    for (const [lei, ari] of [[1900, 1600], [3333, 701], [1, 1], [12_345, 4999]]) expect(baniToPerHaLei(perHaToBani(lei!, ari!), ari!)).toBe(lei);
  });

  it('rounds total -> per-ha to the whole leu, half up', () => {
    expect(baniToPerHaLei(3_030_400, 1600)).toBe(1894); // 30.304 lei / 16 ha = 1.894
    expect(baniToPerHaLei(150, 100)).toBe(2); // 1,50 lei/ha -> 2
    expect(baniToPerHaLei(149, 100)).toBe(1);
  });

  it('has no per-ha figure without hectares', () => {
    expect(baniToPerHaLei(100_000, 0)).toBeNull();
    expect(perHaBani(100_000, 0)).toBeNull();
    expect(tonnesToPerHa(10, 0)).toBeNull();
  });

  it('shows bani per hectare', () => {
    expect(perHaBani(3_040_000, 1600)).toBe(190_000);
    expect(perHaBani(-1_500_000, 1500)).toBe(-100_000);
  });

  it('converts tonnes to 2 decimals', () => {
    expect(tonnesToPerHa(80, 1600)).toBe(5);
    expect(tonnesToPerHa(86.9, 1600)).toBe(5.43);
    expect(perHaToTonnes(5, 1600)).toBe(80);
    expect(perHaToTonnes(5.43, 1600)).toBe(86.88);
  });

  it('refuses areas that are not whole ari', () => {
    expect(() => perHaToBani(100, 1.5)).toThrow();
  });
});
