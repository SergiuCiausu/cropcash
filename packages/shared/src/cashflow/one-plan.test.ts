import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { buildFarmPlan, grainInBarn, proposeSplit } from '../functions/plan';
import { farmData, type PlanFarm } from './farm-plan';
import { computeFarmPlan } from './plan';
import { simulationSteps } from './simulate';

const data = loadData();
const ion = (over: Partial<PlanFarm> = {}): PlanFarm => ({
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
  ...over,
});

/** Plays months of the demo clock with the same steps the Stripe path takes. */
function playYear(farm: PlanFarm, months: number) {
  const readings: { day: string; paid: number; shown: number; safe: number; shownSafe: number }[] = [];
  const read = (f: PlanFarm, day: string) => {
    const paid = computeFarmPlan({ ...f, demo_now: `${day}T00:00:00Z` }, data);
    const shown = buildFarmPlan({ ...f, demo_now: `${day}T00:00:00Z` }, data, { month: day.slice(0, 7) });
    readings.push({ day, paid: paid.monthlySalary, shown: shown.monthlySalary, safe: paid.salary.salary, shownSafe: shown.salary.salary });
    return paid.monthlySalary;
  };
  const rows = [...(farm.transactions ?? [])];
  let clock = farm.demo_now!;
  for (let i = 0; i < months; i++) {
    const next = new Date(clock);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = next.toISOString();
    for (const step of simulationSteps({ ...farm, demo_now: clock, transactions: rows }, data, to)) {
      if (step.type === 'income') {
        rows.push({ amount_bani: step.amount, kind: step.kind, occurred_at: `${step.date}T09:00:00Z`, source: 'stripe_transfer', crop_id: step.cropId ?? null, expected_payment_id: step.paymentId ?? null });
      } else if (step.type === 'expense') {
        rows.push({ amount_bani: -step.amount, kind: 'expense', occurred_at: `${step.date}T12:00:00Z`, source: 'manual', category: null, crop_id: step.cropId });
      } else if (step.type === 'repayment') {
        rows.push({ amount_bani: -step.amount, kind: 'loan_repayment', occurred_at: `${step.date}T09:00:00Z`, source: 'manual', expected_payment_id: step.paymentId });
      } else {
        const amount = read({ ...farm, transactions: rows }, step.date);
        if (amount > 0) rows.push({ amount_bani: -amount, kind: 'salary', occurred_at: `${step.date}T08:00:00Z`, source: 'payout' });
      }
    }
    clock = to;
    read({ ...farm, transactions: rows }, clock.slice(0, 10));
  }
  return readings;
}

const creditPair = [
  { id: 'c1', group_id: 'g', kind: 'credit', direction: 'in' as const, amount_probable_bani: 2_000_000, window_start: '2027-04-10', status: 'planned' },
  { id: 'c2', group_id: 'g', kind: 'loan_repayment', direction: 'out' as const, amount_probable_bani: 2_000_000, window_start: '2027-10-20', status: 'planned' },
];

describe('the salary on the screen is the salary paid', () => {
  it.each([
    ['a plain year', ion()],
    ['with a credit', ion({ expected_payments: creditPair })],
    ['with a pension', ion({ pension_plans: { monthly_bani: 30_000, status: 'active' } })],
    ['with a fixed salary', ion({ salary_bani: 90_000 })],
  ])('%s, on payday and mid-month', (_name, farm) => {
    const readings = playYear(farm, 13);
    expect(readings).toHaveLength(26);
    for (const r of readings) {
      expect(r.shown, r.day).toBe(r.paid);
      expect(r.shownSafe, r.day).toBe(r.safe);
    }
  });

  it('never shows nothing when money is safe to take, once a cost is paid', () => {
    const march = playYear(ion(), 5).find((r) => r.day === '2027-03-15')!;
    expect(march.shownSafe).toBeGreaterThan(0);
  });
});

describe('what the plan counts', () => {
  const on = (rows: PlanFarm['transactions'], over: Partial<PlanFarm> = {}) => buildFarmPlan(ion({ transactions: rows, ...over }), data, { month: '2026-11' });

  it('does not treat a credit as income', () => {
    const credit = { amount_bani: 2_000_000, kind: 'credit' as const, occurred_at: '2026-11-10T09:00:00Z', source: 'stripe_transfer', expected_payment_id: 'c1' };
    const plan = on([credit]);
    expect(plan.startBalance).toBe(5_500_000);
  });

  it('takes a paid cost with no category off the plan once', () => {
    const cost = buildFarmPlan(ion(), data, { month: '2027-03' }).timelines.medium.months[0]!.entries.find((e) => e.kind === 'input_cost')!;
    const paid = { amount_bani: -cost.value, kind: 'expense' as const, occurred_at: `${cost.date}T12:00:00Z`, source: 'manual', category: null, crop_id: cost.cropId };
    const before = buildFarmPlan(ion(), data, { month: '2027-03' });
    const after = buildFarmPlan(ion({ transactions: [paid] }), data, { month: '2027-03' });
    const end = (p: typeof before) => p.timelines.medium.months.at(-1)!.balanceEnd;
    expect(end(after)).toBe(end(before));
  });

  it('keeps a repair out of the planned costs', () => {
    const repair = { amount_bani: -40_000, kind: 'expense' as const, occurred_at: '2026-11-10T12:00:00Z', source: 'manual', category: 'repairs', crop_id: 'grau' };
    const end = (p: ReturnType<typeof on>) => p.timelines.medium.months.at(-1)!.balanceEnd;
    expect(end(on([repair]))).toBe(end(on([])) - 40_000);
  });

  it('counts an old Stripe row with no kind, and ignores any other', () => {
    expect(on([{ amount_bani: 100, kind: null, occurred_at: '2026-11-10T09:00:00Z', source: 'payout' }]).startBalance).toBe(3_500_100);
    expect(on([{ amount_bani: 100, kind: null, occurred_at: '2026-11-10T09:00:00Z', source: 'other' }]).startBalance).toBe(3_500_000);
  });

  it('splits money with the salary that gets paid, not the safe one', () => {
    const fixed = on([], { salary_bani: 10_000 });
    expect(fixed.monthlySalary).toBe(10_000);
    expect(fixed.monthlySalary).toBeLessThan(fixed.salary.salary);
    expect(proposeSplit(fixed, 1_000_000, false).split.salary).toBe(10_000 * proposeSplit(fixed, 1_000_000, false).monthsCovered);
  });

  it('uses the pension really paid', () => {
    const none = on([]);
    const paying = on([], { pension_plans: [{ monthly_bani: 30_000, status: 'active' }] });
    const stopped = on([], { pension_plans: [{ monthly_bani: 30_000, status: 'cancelled' }] });
    expect(paying.salary.salary).toBeLessThan(none.salary.salary);
    expect(stopped.salary.salary).toBe(none.salary.salary);
  });
});

describe("the farmer's own harvest", () => {
  const year = { year: 2027, status: 'open' as const, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8 }] };
  const gathered = (over = {}) => ({ cropId: 'grau', areaHa: 8, tonnes: 80, priceLeiPerKg: 2, storedTonnes: 0, ...over });
  const withHarvest = (over = {}) => ion({ harvests: { years: [year], gathered: [gathered(over)] } });
  const end = (f: PlanFarm) => computeFarmPlan(f, data).timelines.medium.months.at(-1)!.balanceEnd;

  it('feeds the plan the payout uses', () => {
    expect(end(withHarvest())).toBeGreaterThan(end(ion()));
  });

  it('gives the same answer as passing the merged data', () => {
    const farm = withHarvest();
    const merged = farmData(farm, data);
    expect(buildFarmPlan(farm, data, { month: '2026-11' }).salary).toEqual(buildFarmPlan(farm, merged, { month: '2026-11' }).salary);
  });

  it('lets what the farmer expects win over what was gathered, figure by figure', () => {
    const expected = [{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null }];
    const grau = (f: PlanFarm) => farmData(f, data).crops.crops.find((c) => c.id === 'grau')!;
    const farm = ion({ harvests: { years: [year], gathered: [gathered()], expected } });
    expect(grau(farm).yield_t_per_ha.mean).toBe(6);
    expect(grau(farm).price_lei_per_kg.mean).toBe(2);
  });

  it('pays what the screen shows when the farmer set their own figures', () => {
    const expected = [{ cropId: 'porumb', yieldTPerHa: 9, priceLeiPerKg: 1.5 }];
    const farm = ion({ harvests: { years: [year], gathered: [], expected } });
    const screen = buildFarmPlan(farm, data, { month: '2026-11' });
    expect(computeFarmPlan(farm, data).timelines.medium.months.at(-1)!.balanceEnd).toBe(screen.timelines.medium.months.at(-1)!.balanceEnd);
    expect(computeFarmPlan(farm, data).salary).toEqual(screen.salary);
    expect(end(farm)).toBeGreaterThan(end(ion()));
  });

  it('leaves the data alone when nothing was gathered', () => {
    expect(farmData({ ...ion(), county: null }, data)).toBe(data);
  });

  it('counts grain in the barn as income to come', () => {
    expect(end(withHarvest({ storedTonnes: 10 }))).toBeGreaterThan(end(withHarvest({ storedTonnes: 0 })));
  });

  it('takes sold grain out of the barn, but not a sale of the new harvest', () => {
    const crop = data.crops.crops.find((c) => c.id === 'grau')!;
    const month = String(crop.sale_month_default).padStart(2, '0');
    const offSeason = crop.sale_month_default === 3 ? '04' : '03';
    const worthOf1t = 1000 * crop.price_lei_per_kg.mean * 100;
    const sale = (m: string) => ({ amount_bani: worthOf1t, kind: 'sale' as const, occurred_at: `2027-${m}-10T12:00:00Z`, crop_id: 'grau' });
    const rows = [{ cropId: 'grau', storedTonnes: 10 }];
    expect(grainInBarn(rows, [sale(offSeason)], data)[0]!.kg).toBe(9000);
    expect(grainInBarn(rows, [sale(month)], data)[0]!.kg).toBe(10_000);
  });

  it('never leaves less than an empty barn', () => {
    const sale = { amount_bani: 999_999_999, kind: 'sale' as const, occurred_at: '2027-03-10T12:00:00Z', crop_id: 'grau' };
    expect(grainInBarn([{ cropId: 'grau', storedTonnes: 1 }], [sale], data)[0]!.kg).toBe(0);
  });
});
