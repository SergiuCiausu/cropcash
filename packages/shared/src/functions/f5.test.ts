import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { farmToday, recordedTransactions, type StoredTransaction } from '../farm';
import type { ReadContext } from './define';
import { buildFarmPlan, plannedForMonth } from './plan';
import { advanceClock, getPayouts, simulateApiaAdvance, startPension } from './registry';

const data = loadData();
const farm = {
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};
const month = '2026-11';
const advance = 1_264_932;
const stripe = (over: Partial<StoredTransaction>): StoredTransaction => ({
  id: 'pi_1',
  kind: null,
  category: 'apia_advance',
  crop_id: null,
  amount_bani: advance,
  occurred_at: '2026-11-07T12:00:00Z',
  note: null,
  source: 'stripe_transfer',
  ...over,
});
const planned = (p: ReturnType<typeof buildFarmPlan>, kind: string) =>
  p.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind === kind).reduce((s, e) => s + e.value, 0);

describe('money through Stripe', () => {
  const base = buildFarmPlan(farm, data, { month });
  const paid = buildFarmPlan({ ...farm, transactions: [stripe({})] }, data, { month });

  it('counts the APIA advance once: it leaves the forecast as it joins the balance', () => {
    expect(paid.startBalance).toBe(3_500_000 + advance);
    expect(planned(paid, 'apia_advance')).toBe(planned(base, 'apia_advance') - advance);
    expect(paid.timelines.medium.months.at(-1)!.balanceEnd).toBe(base.timelines.medium.months.at(-1)!.balanceEnd);
  });

  it('leaves the salary as it was when the advance arrives', () => {
    expect(paid.salary.salary).toBe(base.salary.salary);
  });

  it('keeps the salary when the money is split into envelopes', () => {
    const envelopes = [{ kind: 'spring_inputs', balance_bani: Math.round(advance / 2) }];
    const split = buildFarmPlan({ ...farm, transactions: [stripe({})], envelopes }, data, { month });
    expect(split.salary.salary).toBe(base.salary.salary);
  });

  it('matches an APIA balance paid in any month of its window', () => {
    const march = '2027-03';
    const before = buildFarmPlan(farm, data, { month: march });
    const row = stripe({ id: 'pi_2', category: 'apia_balance', amount_bani: 300_000, occurred_at: '2027-03-16T12:00:00Z' });
    const after = buildFarmPlan({ ...farm, transactions: [row] }, data, { month: march });
    expect(planned(after, 'apia_balance')).toBe(planned(before, 'apia_balance') - 300_000);
  });

  it('counts salaries and pension payments as money gone', () => {
    const rows = [
      stripe({ id: 'po_1', source: 'payout', category: 'salary', amount_bani: -85_000 }),
      stripe({ id: 'in_1', source: 'subscription', category: 'pension', amount_bani: -5_000 }),
    ];
    expect(buildFarmPlan({ ...farm, transactions: rows }, data, { month }).startBalance).toBe(3_410_000);
  });

  it('counts a salary once: the transaction booked when it is sent, whatever the payout status', () => {
    const salary = stripe({ id: 'po_1', kind: 'salary', source: 'payout', category: null, amount_bani: -85_000 });
    const balance = (status: string) =>
      buildFarmPlan(
        { ...farm, payouts: [{ id: 'a', amount_bani: 85_000, scheduled_for: '2026-12-01', status }], transactions: [salary] },
        data,
        { month },
      ).startBalance;
    expect(balance('pending')).toBe(3_415_000);
    expect(balance('paid')).toBe(3_415_000);
  });

  it("keeps Stripe rows off the farmer's own list, so they can't be undone", () => {
    expect(recordedTransactions([stripe({})])).toEqual([]);
  });

  it('lowers the salary by the pension that was started', () => {
    const withPension = buildFarmPlan({ ...farm, pension_plans: { monthly_bani: 5_000, status: 'active' } }, data, { month });
    expect(withPension.salary.salary).toBeLessThan(base.salary.salary);
  });

  it('ignores a stopped pension', () => {
    const stopped = buildFarmPlan({ ...farm, pension_plans: [{ monthly_bani: 5_000, status: 'stopped' }] }, data, { month });
    expect(stopped.salary.salary).toBe(base.salary.salary);
  });
});

describe('plannedForMonth', () => {
  it('finds the APIA balance in March and spring costs', () => {
    const march = plannedForMonth(farm, data, '2027-03');
    expect(march.income.map((e) => e.kind)).toContain('apia_balance');
    expect(march.costs.length).toBeGreaterThan(0);
    expect(march.day).toBe('2027-03-01');
  });

  it('skips what already arrived', () => {
    const paid = stripe({ id: 'pi_2', category: 'apia_balance', amount_bani: 99_999_999, occurred_at: '2027-02-01T12:00:00Z' });
    expect(plannedForMonth({ ...farm, transactions: [paid] }, data, '2027-03').income.map((e) => e.kind)).not.toContain('apia_balance');
  });
});

describe('the demo clock', () => {
  it('replaces today once set', () => {
    expect(farmToday({ demo_now: '2027-05-07T00:00:00Z' }, '2026-11-07')).toBe('2027-05-07');
    expect(farmToday({ demo_now: null }, '2026-11-07')).toBe('2026-11-07');
  });
});

describe('get_payouts', () => {
  const plan = buildFarmPlan(farm, data, { month });
  const ctx: ReadContext = { farm, plan, data, today: '2026-11-07' };

  it('lists salaries and pension payments, newest first', () => {
    const stored = {
      ...farm,
      payouts: [
        { id: 'a', amount_bani: 85_000, scheduled_for: '2026-12-01', status: 'paid' },
        { id: 'b', amount_bani: 85_000, scheduled_for: '2027-01-01', status: 'pending' },
      ],
      transactions: [stripe({ id: 'in_1', source: 'subscription', category: 'pension', amount_bani: -5_000 })],
    };
    expect(getPayouts.execute({}, { ...ctx, farm: stored }).data).toEqual({
      salaries: [
        { month: '2027-01', amount: 85_000, status: 'pending' },
        { month: '2026-12', amount: 85_000, status: 'paid' },
      ],
      pension: [{ date: '2026-11-07', amount: 5_000 }],
    });
  });
});

describe('Stripe writes', () => {
  it('keeps the demo buttons away from the AI', () => {
    expect(simulateApiaAdvance.access).toBe('user');
    expect(advanceClock.access).toBe('user');
    expect(startPension.access).toBe('confirm');
  });

  it('checks the input', () => {
    expect(advanceClock.request({ months: 6 }).path).toBe('/api/demo/advance');
    expect(() => advanceClock.request({ months: 13 })).toThrow();
    expect(() => startPension.request({ monthlyLei: 1.5 })).toThrow();
    expect(() => startPension.request({ monthlyLei: 0 })).toThrow();
  });
});
