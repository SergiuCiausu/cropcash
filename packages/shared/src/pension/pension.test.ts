import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { pensionMinimum, simulatePension, suggestPension } from './index';

const data = loadData();
const ion = { age: 55, monthly: 20_000, annualPct: 4, targetAge: 65 };

describe('simulatePension', () => {
  it('matches the docs example: 200 lei a month from 55 at 4%', () => {
    const r = simulatePension(ion);
    expect(r.months).toBe(120);
    expect(r.paidIn).toBe(2_400_000);
    expect(r.total / 100).toBeCloseTo(29449.96, 0);
    expect(Math.round(r.monthlyEquivalent / 100)).toBe(245);
  });

  it('returns whole bani', () => {
    expect(Number.isInteger(simulatePension({ ...ion, monthly: 12_345 }).total)).toBe(true);
  });

  it('gives back exactly what was put in at 0%', () => {
    const r = simulatePension({ ...ion, annualPct: 0 });
    expect(r.total).toBe(r.paidIn);
  });

  it('has nothing to simulate from the target age on', () => {
    expect(simulatePension({ ...ion, age: 65 })).toEqual({ months: 0, paidIn: 0, total: 0, monthlyEquivalent: 0 });
    expect(simulatePension({ ...ion, age: 70 }).months).toBe(0);
  });

  it('grows with a higher return', () => {
    const at = (annualPct: number) => simulatePension({ ...ion, annualPct }).total;
    expect(at(2)).toBeLessThan(at(4));
    expect(at(4)).toBeLessThan(at(6));
  });
});

describe('suggestPension', () => {
  it('stays within 5% of the salary and rounds down to 50 lei', () => {
    expect(suggestPension(400_000, data).monthly).toBe(20_000);
    expect(suggestPension(270_000, data).monthly).toBe(10_000);
  });

  it('suggests the 50 lei minimum when 5% is under it, and says it is above the usual share', () => {
    expect(suggestPension(85_000, data)).toMatchObject({ monthly: 5_000, aboveShare: true });
    expect(suggestPension(270_000, data).aboveShare).toBe(false);
  });

  it('suggests nothing with no salary', () => {
    expect(suggestPension(0, data)).toMatchObject({ monthly: 0, aboveShare: false });
  });
});

describe('fund minimums', () => {
  it('uses the chosen fund, up or down from the default', () => {
    expect(pensionMinimum(data, 'stabil')).toMatchObject({ amount: 2_500, verified: true });
    expect(suggestPension(85_000, data, 'stabil').monthly).toBe(2_500);
    expect(suggestPension(85_000, data, 'raiffeisen-acumulare')).toMatchObject({ monthly: 10_000, aboveShare: true });
  });

  it('keeps the share of the salary when that is more than the minimum', () => {
    expect(suggestPension(400_000, data, 'stabil').monthly).toBe(20_000);
  });

  it('never presents an unconfirmed minimum as confirmed', () => {
    expect(pensionMinimum(data, 'azt-moderato')).toMatchObject({ amount: 5_000, verified: false });
    expect(pensionMinimum(data, 'raiffeisen-acumulare').verified).toBe(false);
  });

  it('falls back to the default, marked unverified, when the figure is missing', () => {
    expect(pensionMinimum(data, 'pensia-mea')).toMatchObject({ amount: 5_000, verified: false });
  });

  it('uses the default with no fund, or a fund no longer on the list', () => {
    expect(pensionMinimum(data)).toMatchObject({ amount: 5_000, fund: null, verified: true });
    expect(pensionMinimum(data, 'gone').fund).toBeNull();
  });

  it('lists the funds alphabetically, so the order recommends nothing', () => {
    const names = data.pensionFunds.funds.map((f) => f.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ro')));
  });

  it('marks every missing figure DE-VERIFICAT', () => {
    for (const f of data.pensionFunds.funds) {
      if (f.min_monthly_lei === null) expect(f.status).toBe('DE-VERIFICAT');
    }
  });
});
