import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeFarmPlan, type PlanFarm } from './plan';
import { costsBetween, incomesBetween, paydaysBetween, simulationSteps } from './simulate';

const data = loadData();
const ion: PlanFarm = {
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  demo_now: '2026-11-07T10:00:00Z',
};

describe('computeFarmPlan', () => {
  it('uses the demo clock as today', () => {
    const p = computeFarmPlan(ion, data);
    expect(p.today).toBe('2026-11-07');
    expect(p.timelines.medium.months[0]!.key).toBe('2026-11');
  });

  it('a received APIA advance adds to the money and is not counted twice', () => {
    const before = computeFarmPlan(ion, data);
    const after = computeFarmPlan(
      {
        ...ion,
        transactions: [{ amount_bani: 1_265_220, kind: 'apia_advance', occurred_at: '2026-11-07T10:00:00Z' }],
      },
      data,
    );
    expect(after.startBalance).toBe(3_500_000 + 1_265_220);
    expect(after.timelines.medium.months[0]!.entries.some((e) => e.kind === 'apia_advance')).toBe(false);
    // Same money, just earlier: the end of the year doesn't change.
    expect(after.timelines.medium.months.at(-1)!.balanceEnd).toBe(before.timelines.medium.months.at(-1)!.balanceEnd);
  });

  it('salary and pension reduce the money; the pension is a fixed monthly set-aside', () => {
    const p = computeFarmPlan(
      {
        ...ion,
        transactions: [{ amount_bani: -85_000, kind: 'salary', occurred_at: '2026-12-01T00:00:00Z' }],
        pension_plans: { monthly_bani: 20_000, status: 'active' },
      },
      data,
    );
    expect(p.startBalance).toBe(3_500_000 - 85_000);
    expect(p.pensionMonthly).toBe(20_000);
  });
});

describe('simulation', () => {
  it('paydays are the first of each month after today, up to the target', () => {
    expect(paydaysBetween('2026-11-07', '2027-01-07')).toEqual(['2026-12-01', '2027-01-01']);
    expect(paydaysBetween('2026-11-07', '2026-11-30')).toEqual([]);
    expect(paydaysBetween('2026-12-15', '2027-02-01')).toEqual(['2027-01-01', '2027-02-01']);
  });

  it('6 months from 7 Nov: the advance (window still open) and the APIA balance mid-March', () => {
    const inc = incomesBetween(ion, data, '2026-11-07', '2027-05-07');
    expect(inc.map((s) => s.type === 'income' && s.kind)).toEqual(['apia_advance', 'apia_balance']);
    expect(inc[0]!.date).toBe('2026-11-08');
    expect(inc[1]!.date).toBe('2027-03-16');
  });

  it('an advance already received is not simulated again', () => {
    const got = { ...ion, transactions: [{ amount_bani: 1_265_220, kind: 'apia_advance' as const, occurred_at: '2026-11-07T10:00:00Z' }] };
    const inc = incomesBetween(got, data, '2026-11-07', '2027-05-07');
    expect(inc.map((s) => s.type === 'income' && s.kind)).toEqual(['apia_balance']);
  });

  it('a paid farm cost is subtracted once: the plan’s end of year stays the same', () => {
    const costs = costsBetween(ion, data, '2026-11-07', '2027-04-07');
    expect(costs.map((c) => c.date)).toEqual(['2027-03-15', '2027-03-15']); // wheat and corn in March
    const before = computeFarmPlan({ ...ion, demo_now: '2027-04-07T10:00:00Z' }, data);
    const paid = computeFarmPlan(
      {
        ...ion,
        demo_now: '2027-04-07T10:00:00Z',
        transactions: costs.map((c) => ({
          amount_bani: -(c as { amount: number }).amount,
          kind: 'expense' as const,
          occurred_at: `${c.date}T12:00:00Z`,
          crop_id: (c as { cropId: string }).cropId,
        })),
      },
      data,
    );
    expect(paid.startBalance).toBe(3_500_000 - 1_375_000);
    // Without recording them, the plan (starting in April) would think the March money is still there.
    expect(before.startBalance - paid.startBalance).toBe(1_375_000);
    expect(costsBetween({ ...ion, transactions: paid.transactions }, data, '2026-11-07', '2027-04-07')).toEqual([]);
  });

  it('steps are in date order, salary first on the same day', () => {
    const steps = simulationSteps(ion, data, '2027-05-07T10:00:00Z');
    expect(steps.filter((s) => s.type === 'salary')).toHaveLength(6);
    const dates = steps.map((s) => s.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
