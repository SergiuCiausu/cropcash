import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { buildFarmPlan } from '../functions/plan';
import { dieselCapCl, dieselFromTransactions, exciseRefundClaims, type ExciseRefundInput, type StoredExciseEnrollment } from './excise';
import type { PlanFarm } from './farm-plan';

const data = loadData();
const approved = (over: Partial<StoredExciseEnrollment> = {}): StoredExciseEnrollment => ({
  scheme_id: 'motorina-hg1174',
  year: 2026,
  status: 'approved',
  acord_on: '2025-12-19',
  ...over,
});
/** 10 ha of wheat: cereale, 78 l/ha, so 780 l a year. */
const wheat = [{ cropId: 'grau', areaHa: 10 }];
const litres = (date: string, l: number) => ({ date, litresCl: l * 100 });
const claims = (over: Partial<ExciseRefundInput>) => exciseRefundClaims({ enrollments: [approved()], diesel: [], crops: wheat, ...over }, data);

describe('dieselCapCl', () => {
  it('caps wheat at 78 l/ha, and a mid-year acord at the months left', () => {
    expect(dieselCapCl(wheat, data, '2025-12-19', 2026)).toEqual({ capCl: 78_000 });
    expect(dieselCapCl(wheat, data, '2026-07-01', 2026)).toEqual({ capCl: 32_500 });
  });

  it('knows no cap when a crop has none in the annex', () => {
    expect(dieselCapCl([...wheat, { cropId: 'nu-exista', areaHa: 1 }], data, null, 2026)).toEqual({ capCl: null });
  });
});

describe('exciseRefundClaims', () => {
  it('pays a quarter back at the rate of the day the diesel was bought, 2 to 6 months after it', () => {
    const [q1] = claims({ diesel: [litres('2026-02-10', 300)] });
    // 300 l × 2,697 lei/l (HG 1174/2014 from 1 January 2026).
    expect(q1).toMatchObject({ id: 'excise:motorina-hg1174:2026-Q1', period: '2026-Q1', amount: 80_910, litresCl: 30_000, noRateCl: 0, overCapCl: 0 });
    expect(q1!.window).toEqual({ start: '2026-05-31', end: '2026-09-30' });
    // The payment delay is DE-VERIFICAT.
    expect(q1!.unverified).toBe(true);
  });

  it('adds nothing for an acord that is not approved, or a year the scheme is over', () => {
    expect(claims({ enrollments: [approved({ status: 'acord_filed' })], diesel: [litres('2026-02-10', 300)] })).toEqual([]);
    expect(claims({ enrollments: [approved({ year: 2027 })], diesel: [litres('2027-02-10', 300)] })).toEqual([]);
    // Litres of another year don't count in this one.
    expect(claims({ diesel: [litres('2025-11-10', 300)] })).toEqual([]);
  });

  it('cuts the latest litres at the year\'s cap', () => {
    const [q1, q2] = claims({ diesel: [litres('2026-02-10', 500), litres('2026-05-10', 500)] });
    expect(q1).toMatchObject({ litresCl: 50_000, overCapCl: 0 });
    // 780 l a year: 280 l of the second quarter count. From 7 April the rate is 2,397 lei/l.
    expect(q2).toMatchObject({ period: '2026-Q2', litresCl: 28_000, overCapCl: 22_000, amount: 67_116 });
  });

  it('leaves out litres on a day with no known rate', () => {
    // December 2026 has no rate yet (fuel-excise.json, null): only November counts.
    const [q4] = claims({ diesel: [litres('2026-11-10', 100), litres('2026-12-10', 100)] });
    expect(q4).toMatchObject({ period: '2026-Q4', litresCl: 10_000, noRateCl: 10_000, amount: 19_960 });
    expect(claims({ diesel: [litres('2026-12-10', 100)] })).toEqual([]);
  });

  it('counts a mid-year acord only from its day', () => {
    const out = claims({ enrollments: [approved({ acord_on: '2026-07-01' })], diesel: [litres('2026-05-10', 100), litres('2026-07-10', 100)] });
    expect(out.map((c) => c.period)).toEqual(['2026-Q3']);
  });

  it('drops a quarter already paid, and counts with no cap when a crop has none', () => {
    expect(claims({ diesel: [litres('2026-02-10', 300)], paid: new Set(['motorina-hg1174:2026-Q1']) })).toEqual([]);
    const [free] = claims({ crops: [{ cropId: 'nu-exista', areaHa: 1 }], diesel: [litres('2026-02-10', 3000)] });
    expect(free).toMatchObject({ litresCl: 300_000, overCapCl: 0, unverified: true });
  });

  it('ignores schemes that bring no money, or that it has no figures for', () => {
    expect(claims({ enrollments: [approved({ scheme_id: 'tuica-gospodarie' })], diesel: [litres('2026-02-10', 300)] })).toEqual([]);
  });
});

describe('dieselFromTransactions', () => {
  it('keeps only diesel expenses with litres', () => {
    expect(
      dieselFromTransactions([
        { category: 'diesel', occurred_at: '2026-02-10T09:00:00Z', fuel_liters_cl: 30_000 },
        { category: 'diesel', occurred_at: '2026-02-11T09:00:00Z', fuel_liters_cl: null },
        { category: 'seeds', occurred_at: '2026-02-12T09:00:00Z', fuel_liters_cl: 100 },
      ]),
    ).toEqual([{ date: '2026-02-10', litresCl: 30_000 }]);
  });
});

describe('the diesel refund in the plan', () => {
  const farm = (over: Partial<PlanFarm> = {}): PlanFarm => ({
    county: 'TR',
    birth_year: 1971,
    start_balance_bani: 3_500_000,
    demo_now: '2026-11-15T00:00:00Z',
    salary_bani: null,
    parcels: [{ crop_id: 'grau', area_ari: 1000, is_arable: true }],
    transactions: [{ amount_bani: -250_000, kind: 'expense', category: 'diesel', occurred_at: '2026-09-10T09:00:00Z', fuel_liters_cl: 30_000, source: 'manual' }],
    ...over,
  });
  const refunds = (f: PlanFarm) =>
    buildFarmPlan(f, data, { month: '2026-11' }).timelines.medium.months.flatMap((m) => m.entries.filter((e) => e.kind === 'excise_refund'));

  it('comes in on the last day of its window, as the plan counts APIA money', () => {
    const [q3] = refunds(farm({ farm_excise_schemes: [approved()] }));
    // 300 l at 1,996 lei/l (acciza redusă cu 25% from 1 September, DE-VERIFICAT).
    expect(q3).toMatchObject({ id: 'excise:motorina-hg1174:2026-Q3', direction: 'in', value: 59_880, date: '2027-03-30', estimated: true, unverified: true });
  });

  it('is not in the plan without an approved acord', () => {
    expect(refunds(farm())).toEqual([]);
    expect(refunds(farm({ farm_excise_schemes: [approved({ status: 'interested' })] }))).toEqual([]);
  });

  it('raises what the farm can pay itself', () => {
    const without = buildFarmPlan(farm(), data, { month: '2026-11' });
    const withRefund = buildFarmPlan(farm({ farm_excise_schemes: [approved()] }), data, { month: '2026-11' });
    const total = (p: typeof without) => p.timelines.medium.months.reduce((s, m) => s + m.in, 0);
    expect(total(withRefund) - total(without)).toBe(59_880);
  });
});
