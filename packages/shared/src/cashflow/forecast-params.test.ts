import { describe, expect, it } from 'vitest';
import { loadData, PlanParamsFileSchema, type AppData, type PlanParamsFile } from '../data';
import { afterBadHarvest, buildFarmPlan, plannedForMonth, type PlanFarm } from './farm-plan';
import { computeFarmPlan } from './plan';

/* The plan's shape comes from plan-params.json `forecast` (docs/admin-panel-plan.md step 1):
   each setting there has to change the plan, and the file's values give the plan it always gave. */

const data = loadData();
type Forecast = PlanParamsFile['forecast'];
const withForecast = (patch: Partial<Forecast>): AppData => ({
  ...data,
  params: { ...data.params, forecast: { ...data.params.forecast, ...patch } },
});

const ion: PlanFarm = {
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: '2026-11-15T00:00:00Z',
  salary_bani: null,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  transactions: [],
};
const month = '2026-11';
const years = data.params.forecast.years;
const entries = (plan: ReturnType<typeof buildFarmPlan>, scenario: 'bad' | 'medium' | 'good', kind: string) =>
  plan.timelines[scenario].months.flatMap((m) => m.entries).filter((e) => e.kind === kind);

describe('plan-params forecast', () => {
  it('the file says what the code used to: 12 / 24 months, 3 years, the 15th, late APIA, P4 years', () => {
    const f = data.params.forecast;
    expect([f.plan_months.value, f.after_bad_harvest_months.value, f.projection_years.value, f.entry_day.value]).toEqual([12, 24, 3, 15]);
    expect(f.apia_day).toMatchObject({ plan: 'late', demo_clock: 'mid' });
    expect(f.years.bad).toEqual({ yield: 'min', price: 'mean', cost: 'mean', apia_balance: 'min' });
    expect(f.years.medium).toEqual({ yield: 'mean', price: 'mean', cost: 'mean', apia_balance: 'mean' });
    expect(f.years.good).toEqual({ yield: 'max', price: 'mean', cost: 'mean', apia_balance: 'max' });
  });

  it('refuses a kind of year with an unknown end or a day past the 28th', () => {
    const bad = (forecast: unknown) => PlanParamsFileSchema.safeParse({ ...data.params, forecast }).success;
    expect(bad({ ...data.params.forecast, years: { ...years, bad: { ...years.bad, yield: 'worst' } } })).toBe(false);
    expect(bad({ ...data.params.forecast, entry_day: { value: 31 } })).toBe(false);
    expect(bad({ ...data.params.forecast, plan_months: { value: 0 } })).toBe(false);
  });

  it('plan_months sets how far the plan reaches', () => {
    const plan = buildFarmPlan(ion, withForecast({ plan_months: { value: 6 } }), { month });
    expect(plan.timelines.medium.months).toHaveLength(6);
  });

  it('after_bad_harvest_months sets how long "An slab" runs', () => {
    const run = afterBadHarvest(ion, withForecast({ after_bad_harvest_months: { value: 30 } }), { month });
    expect(run?.months).toBe(30);
  });

  it('projection_years sets the quarterly projection', () => {
    const three = computeFarmPlan(ion, data).projection.medium.years.length;
    const two = computeFarmPlan(ion, withForecast({ projection_years: { value: 2 } })).projection.medium.years.length;
    expect(two).toBe(three - 1);
  });

  it('entry_day moves costs and sales to that day', () => {
    const plan = buildFarmPlan(ion, withForecast({ entry_day: { value: 5 } }), { month });
    const days = [...entries(plan, 'medium', 'input_cost'), ...entries(plan, 'medium', 'crop_sale')].map((e) => e.date.slice(8));
    expect(new Set(days)).toEqual(new Set(['05']));
  });

  it('apia_day.plan moves the APIA balance inside its window', () => {
    const balanceMonth = (d: AppData) => entries(buildFarmPlan(ion, d, { month }), 'medium', 'apia_balance')[0]?.date.slice(0, 7);
    expect(balanceMonth(data)).toBe('2027-06');
    expect(balanceMonth(withForecast({ apia_day: { plan: 'early', demo_clock: 'mid' } }))).toBe('2026-12');
  });

  it('apia_day.demo_clock is what the demo clock pays', () => {
    const atMarch = (d: AppData) => plannedForMonth(ion, d, '2027-03').income.some((e) => e.kind === 'apia_balance');
    expect(atMarch(data)).toBe(true);
    expect(atMarch(withForecast({ apia_day: { plan: 'late', demo_clock: 'late' } }))).toBe(false);
  });

  it('a bad year can be told to pay the most for costs and the normal APIA balance', () => {
    const changed = withForecast({ years: { ...years, bad: { ...years.bad, cost: 'max', apia_balance: 'mean' } } });
    const before = buildFarmPlan(ion, data, { month });
    const after = buildFarmPlan(ion, changed, { month });
    const sum = (es: { value: number }[]) => es.reduce((s, e) => s + e.value, 0);
    expect(sum(entries(after, 'bad', 'input_cost'))).toBeGreaterThan(sum(entries(before, 'bad', 'input_cost')));
    expect(sum(entries(after, 'bad', 'apia_balance'))).toBe(sum(entries(before, 'medium', 'apia_balance')));
    // The normal year, and so the salary, doesn't move.
    expect(after.monthlySalary).toBe(before.monthlySalary);
  });
});
