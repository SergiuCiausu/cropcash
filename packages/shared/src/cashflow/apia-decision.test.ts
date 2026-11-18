import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { saveApiaDecision } from '../functions/registry';
import { whatIfSubsidy } from '../functions/whatIf';
import { buildFarmPlan, farmSubsidies, plannedForMonth } from '../functions/plan';
import { ApiaDecisionSchema, withApiaDecision } from '../subsidies';
import type { PlanFarm } from './farm-plan';
import { computeFarmPlan } from './plan';

const data = loadData();
const campaignYear = data.subsidies.meta.campaign_year;
const month = '2026-11';
const ion = (over: Partial<PlanFarm> = {}): PlanFarm => ({
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: '2026-11-15T00:00:00Z',
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  transactions: [],
  ...over,
});
const estimate = farmSubsidies(ion(), data);
const decision = { campaignYear, totalBani: 2_500_000 };
const apiaEntries = (plan: ReturnType<typeof buildFarmPlan>) =>
  plan.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind === 'apia_advance' || e.kind === 'apia_balance');

describe('withApiaDecision', () => {
  it('replaces the range with the one real total, and keeps the schemes', () => {
    const r = withApiaDecision(estimate, decision, campaignYear);
    expect(r.totals.lei).toEqual({ min: 2_500_000, probable: 2_500_000, max: 2_500_000 });
    expect(r.schemes).toEqual(estimate.schemes);
    expect(r.decision).toEqual(decision);
  });

  it('keeps advance plus balance equal to the total', () => {
    const r = withApiaDecision(estimate, decision, campaignYear);
    expect(r.totals.advanceLei + r.totals.balanceLei.probable).toBe(2_500_000);
    expect(r.totals.advanceLei / 2_500_000).toBeCloseTo(estimate.totals.advanceLei / estimate.totals.lei.probable, 3);
  });

  it('counts an advance that really arrived, whatever the estimate said', () => {
    const r = withApiaDecision(estimate, decision, campaignYear, 2_000_000);
    expect(r.totals.advanceLei).toBe(2_000_000);
    expect(r.totals.balanceLei.probable).toBe(500_000);
  });

  it('never leaves a negative balance', () => {
    const r = withApiaDecision(estimate, decision, campaignYear, 9_000_000);
    expect(r.totals.balanceLei.probable).toBe(0);
  });

  it('ignores a decision from another campaign, or none', () => {
    expect(withApiaDecision(estimate, { campaignYear: campaignYear - 1, totalBani: 1 }, campaignYear)).toBe(estimate);
    expect(withApiaDecision(estimate, null, campaignYear)).toBe(estimate);
  });
});

describe('a decision in the plan', () => {
  const before = buildFarmPlan(ion(), data, { month });
  const after = buildFarmPlan(ion({ apia_decision: decision }), data, { month });

  it('moves the salary when the real total is higher', () => {
    expect(after.salary.salary).toBeGreaterThan(before.salary.salary);
  });

  it('gives the screen and the payout the same salary', () => {
    const paid = computeFarmPlan(ion({ apia_decision: decision }), data);
    expect(paid.salary.salary).toBe(after.salary.salary);
    expect(paid.monthlySalary).toBe(after.monthlySalary);
  });

  it('is the same money in every kind of year', () => {
    const sum = (key: 'bad' | 'good') =>
      after.timelines[key].months.flatMap((m) => m.entries).filter((e) => e.kind.startsWith('apia')).reduce((s, e) => s + e.value, 0);
    expect(sum('bad')).toBe(sum('good'));
  });

  it('plans the balance as what the decision leaves after a real advance', () => {
    const paid = ion({
      apia_decision: decision,
      transactions: [{ id: 't', kind: 'apia_advance', amount_bani: 2_000_000, occurred_at: '2026-11-02T12:00:00Z', source: 'stripe_transfer' }],
    });
    const plan = buildFarmPlan(paid, data, { month });
    expect(plan.subsidies.totals.balanceLei.probable).toBe(500_000);
    expect(apiaEntries(plan).find((e) => e.kind === 'apia_balance')?.value).toBe(500_000);
  });

  it('sets the money the demo clock pays out', () => {
    const planned = plannedForMonth(ion({ apia_decision: decision }), data, '2026-11');
    expect(planned.income.find((e) => e.kind === 'apia_advance')?.value).toBe(after.subsidies.totals.advanceLei);
  });

  it('never counts as money the farmer has', () => {
    expect(after.startBalance).toBe(before.startBalance);
  });

  it('changes the total a credit is measured against', () => {
    expect(after.subsidies.totals.lei.probable).not.toBe(before.subsidies.totals.lei.probable);
  });
});

describe('what-if with a decision saved', () => {
  it('still compares estimates, so the same farm changes nothing', () => {
    const farm = ion({ apia_decision: decision });
    const plan = buildFarmPlan(farm, data, { month });
    const w = whatIfSubsidy(plan, farm as never, data, {})!;
    expect(w.difference).toBe(0);
    expect(w.before).toEqual(estimate.totals.lei);
  });
});

describe('save_apia_decision', () => {
  it('takes whole bani only', () => {
    expect(ApiaDecisionSchema.safeParse({ campaignYear, totalBani: 100.5 }).success).toBe(false);
    expect(ApiaDecisionSchema.safeParse({ campaignYear, totalBani: 0 }).success).toBe(false);
  });

  it('is hidden from the AI', () => {
    expect(saveApiaDecision.access).toBe('user');
  });
});
