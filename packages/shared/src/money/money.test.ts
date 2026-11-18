import { describe, expect, it } from 'vitest';
import {
  applyPct,
  areaTimesRate,
  ceilTo,
  eurCentsToBani,
  eurToCents,
  floorTo,
  haToAri,
  parseWholeLei,
} from './index';

describe('parseWholeLei', () => {
  it.each([
    ['35000', 35000],
    ['35 000', 35000],
    ['35 000', 35000],
    ['35.000', 35000],
    ['35,000', 35000],
    ['35000 lei', 35000],
    ['35.000 LEI', 35000],
    ['35 000,00', 35000],
    ['35.000,00', 35000],
    ['1.250.000', 1250000],
    ['12,0', 12],
    ['0', 0],
  ])('reads %s', (text, lei) => expect(parseWholeLei(text)).toBe(lei));

  it.each(['', '   ', '12,5', '12.50', '1.2.3', '1234.567', '-5', '5 ha', 'abc', null, undefined])('refuses %s', (text) => expect(parseWholeLei(text)).toBeNull());
});

describe('money', () => {
  it('converts decimals to integer minor units without float drift', () => {
    expect(eurToCents(101.03)).toBe(10103);
    expect(eurToCents(0.1 + 0.2)).toBe(30);
    expect(haToAri(10.01)).toBe(1001);
  });

  it('multiplies area by rate exactly', () => {
    expect(areaTimesRate(1500, 10103)).toBe(151545);
    expect(areaTimesRate(1500, 5569)).toBe(83535);
  });

  it('converts EUR to RON at a 4-decimal rate', () => {
    expect(eurCentsToBani(319500, 5.28)).toBe(1686960);
    expect(eurCentsToBani(100, 5.0806)).toBe(508);
  });

  it('applies percentages and rounding steps', () => {
    expect(applyPct(151545, 75)).toBe(113659);
    expect(floorTo(65408, 5000)).toBe(65000);
    expect(ceilTo(1396736, 10000)).toBe(1400000);
  });

  it('rejects non-integer money', () => {
    expect(() => areaTimesRate(15.5, 100)).toThrow();
  });
});
