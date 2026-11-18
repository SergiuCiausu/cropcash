import { describe, expect, it } from 'vitest';
import { todayInRomania } from '../cashflow';
import { loadData } from '../data';
import { buildFarmPlan, planUnverified, planView, type FarmPlanOptions } from './plan';

const data = loadData();
const opts: FarmPlanOptions = { month: '2026-11' };
const ion = {
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};
const lei = (bani: number) => bani / 100;

describe('buildFarmPlan: Ion in the app (docs/07 section 4)', () => {
  const plan = buildFarmPlan(ion, data, opts);

  it('gives 1.050 lei a month without a credit', () => {
    expect(lei(plan.salary.salary)).toBe(1050);
    expect(plan.salary.deficit).toBe(false);
  });

  it('gives 2.950 lei a month with 15.100 lei of credit in April', () => {
    const s = plan.creditSuggestion!;
    expect(lei(s.salary)).toBe(2950);
    expect(lei(s.credit.amount)).toBe(15100);
    expect(s.credit.takeMonth).toBe('2027-04');
  });

  it('plans 12 months from the month it is given', () => {
    expect(plan.timelines.medium.months).toHaveLength(12);
    expect(plan.timelines.medium.months[0]!.key).toBe('2026-11');
    expect(buildFarmPlan(ion, data, { month: '2027-01' }).timelines.medium.months[0]!.key).toBe('2027-01');
  });

  it('is repeatable, and survives JSON unchanged (the API sends it as JSON)', () => {
    expect(buildFarmPlan(ion, data, opts)).toEqual(plan);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('includes a declared credit', () => {
    const payment = (id: string, kind: string, direction: 'in' | 'out', date: string) => ({
      id,
      group_id: 'g1',
      kind,
      direction,
      amount_probable_bani: 1_480_000,
      window_start: date,
      status: 'planned',
    });
    const withCredit = buildFarmPlan(
      {
        ...ion,
        expected_payments: [
          payment('a', 'credit', 'in', '2027-04-01'),
          payment('b', 'loan_repayment', 'out', '2027-10-01'),
        ],
      },
      data,
      opts,
    );
    expect(withCredit.credits).toHaveLength(1);
    expect(withCredit.salary.salary).toBeGreaterThan(plan.salary.salary);
  });
});

describe('planView', () => {
  const plan = buildFarmPlan(ion, data, opts);

  it('returns the chosen scenario and keeps the normal-year salary', () => {
    const view = planView(plan, 'bad');
    expect(view.timeline).toBe(plan.timelines.bad);
    expect(view.salary).toBe(plan.salary);
  });
});

describe('planUnverified', () => {
  const plan = buildFarmPlan(ion, data, opts);
  const items = planUnverified(plan.subsidies);

  it('lists exactly the exchange rates that are not confirmed', () => {
    for (const [fund, rate] of Object.entries(plan.subsidies.rates)) {
      expect(items.includes(`exchange_rate:${fund}`)).toBe(!rate.confirmed);
    }
  });

  it('lists schemes with unconfirmed rules', () => {
    for (const s of plan.subsidies.schemes) {
      const flagged = s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;
      expect(items.includes(`scheme:${s.code}`)).toBe(flagged);
    }
  });
});

describe('todayInRomania', () => {
  it('uses Romanian time, not the server clock', () => {
    // 22:30 UTC on 31 December is already 1 January in Bucharest.
    expect(todayInRomania(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
    expect(todayInRomania(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07');
  });
});
