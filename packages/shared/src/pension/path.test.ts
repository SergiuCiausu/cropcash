import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { pensionParams, pensionPath, simulatePensionScenarios } from './index';

const params = pensionParams(loadData());

describe('pensionPath', () => {
  it('has one point a year, from today (all 0) to the target age', () => {
    const path = pensionPath(55, 20_000, params);
    expect(path).toHaveLength(11);
    expect(path[0]).toEqual({ age: 55, paidIn: 0, value: { low: 0, probable: 0, high: 0 } });
    expect(path.at(-1)!.age).toBe(65);
  });

  it('ends on the same sums as the simulation shown at the top of the page', () => {
    for (const [age, monthly] of [[55, 20_000], [40, 5_000], [64, 50_000]] as const) {
      const sim = simulatePensionScenarios(age, monthly, params)!;
      const last = pensionPath(age, monthly, params).at(-1)!;
      expect(last.value).toEqual(sim.atTarget);
      expect(last.paidIn).toBe(sim.paidIn);
    }
  });

  it('grows every year, and a faster growth stays on top', () => {
    const path = pensionPath(55, 20_000, params);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      expect(b.value.low).toBeGreaterThan(a.value.low);
      expect(b.value.low).toBeGreaterThanOrEqual(b.paidIn);
      expect(b.value.probable).toBeGreaterThan(b.value.low);
      expect(b.value.high).toBeGreaterThan(b.value.probable);
    }
  });

  it('keeps every sum in whole bani', () => {
    for (const p of pensionPath(55, 23_700, params)) for (const v of Object.values(p.value)) expect(Number.isSafeInteger(v)).toBe(true);
  });

  it('is empty at or past the target age and refuses a bad amount', () => {
    expect(pensionPath(65, 20_000, params)).toEqual([]);
    expect(pensionPath(70, 20_000, params)).toEqual([]);
    expect(() => pensionPath(55, 1.5, params)).toThrow();
    expect(pensionPath(55, 0, params).at(-1)!.value).toEqual({ low: 0, probable: 0, high: 0 });
  });
});
