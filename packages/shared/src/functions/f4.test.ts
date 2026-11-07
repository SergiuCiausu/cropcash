import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { UpdateFarmInputSchema, type StoredTransaction } from '../farm';
import type { ReadContext } from './define';
import { buildFarmPlan } from './plan';
import {
  addExpense,
  completeTask,
  convertCurrency,
  getExchangeRates,
  listTasks,
  listTransactions,
  recordSale,
  reopenTask,
  undoTransaction,
  updateFarm,
} from './registry';

const data = loadData();
const farm = {
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};
const month = '2027-03';
const base = buildFarmPlan(farm, data, { month });
const ctx: ReadContext = { farm, plan: base, data, today: '2027-03-10' };
const planned = (p: typeof base, kind: string) =>
  p.timelines.medium.months[0]!.entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.value, 0);

const tx = (over: Partial<StoredTransaction>): StoredTransaction => ({
  id: 'tx-1',
  kind: 'expense',
  category: 'fertilizer',
  crop_id: null,
  amount_bani: -100_000,
  occurred_at: '2027-03-05T12:00:00Z',
  note: null,
  ...over,
});
const withTx = (...transactions: StoredTransaction[]) => buildFarmPlan({ ...farm, transactions }, data, { month });

describe('recorded money in the plan', () => {
  it('a planned cost recorded this month is not counted twice', () => {
    const p = withTx(tx({ amount_bani: -200_000 }));
    expect(p.startBalance).toBe(3_300_000);
    expect(planned(p, 'input_cost')).toBe(planned(base, 'input_cost') - 200_000);
    expect(p.timelines.medium.months.at(-1)!.balanceEnd).toBe(base.timelines.medium.months.at(-1)!.balanceEnd);
  });

  it('costs more than planned lower the money by the difference', () => {
    const cost = planned(base, 'input_cost');
    const p = withTx(tx({ amount_bani: -(cost + 50_000) }));
    expect(planned(p, 'input_cost')).toBe(0);
    expect(p.timelines.medium.months.at(-1)!.balanceEnd).toBe(base.timelines.medium.months.at(-1)!.balanceEnd - 50_000);
  });

  it('an unplanned expense always lowers the money', () => {
    const p = withTx(tx({ category: 'repairs', amount_bani: -80_000 }));
    expect(planned(p, 'input_cost')).toBe(planned(base, 'input_cost'));
    expect(p.timelines.medium.months.at(-1)!.balanceEnd).toBe(base.timelines.medium.months.at(-1)!.balanceEnd - 80_000);
  });

  it('an expense from an earlier month only changes the money', () => {
    const p = withTx(tx({ occurred_at: '2027-01-20T12:00:00Z' }));
    expect(p.startBalance).toBe(3_400_000);
    expect(planned(p, 'input_cost')).toBe(planned(base, 'input_cost'));
  });

  it('a sale recorded in its planned month replaces that planned sale only', () => {
    const july = '2027-07';
    const before = buildFarmPlan(farm, data, { month: july });
    const sold = { ...farm, transactions: [tx({ kind: 'sale', category: null, crop_id: 'grau', amount_bani: 1_000_000, occurred_at: '2027-07-10T12:00:00Z' })] };
    const after = buildFarmPlan(sold, data, { month: july });
    const left = (p: typeof before, crop: string) =>
      p.timelines.medium.months[0]!.entries.filter((e) => e.kind === 'crop_sale' && e.cropId === crop).reduce((s, e) => s + e.value, 0);
    expect(left(after, 'grau')).toBe(left(before, 'grau') - 1_000_000);
    expect(after.timelines.medium.months.at(-1)!.balanceEnd).toBe(before.timelines.medium.months.at(-1)!.balanceEnd);
  });

  it('an old-stock sale adds to the money', () => {
    const p = withTx(tx({ kind: 'sale', category: null, crop_id: 'porumb', amount_bani: 500_000 }));
    expect(p.startBalance).toBe(4_000_000);
    expect(p.timelines.medium.months.at(-1)!.balanceEnd).toBe(base.timelines.medium.months.at(-1)!.balanceEnd + 500_000);
  });

  it('ignores Stripe transactions, which step 6 counts on its own', () => {
    expect(withTx(tx({ kind: null, amount_bani: 999_000 })).startBalance).toBe(3_500_000);
  });
});

describe('list_transactions', () => {
  const rows = [
    tx({ id: 'a', occurred_at: '2027-02-05T12:00:00Z' }),
    tx({ id: 'b', kind: 'sale', category: null, amount_bani: 500_000, occurred_at: '2027-03-01T12:00:00Z' }),
    tx({ id: 'c', kind: null, amount_bani: 1 }),
  ];
  const c = { ...ctx, farm: { ...farm, transactions: rows } };

  it('lists the newest first and leaves out Stripe rows', () => {
    expect(listTransactions.execute({}, c).data!.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('filters by month and kind', () => {
    expect(listTransactions.execute({ month: '2027-02' }, c).data!.map((t) => t.id)).toEqual(['a']);
    expect(listTransactions.execute({ kind: 'sale' }, c).data!.map((t) => t.id)).toEqual(['b']);
  });
});

describe('record_sale and add_expense', () => {
  const date = '2027-03-01';

  it('builds a sale from a total or from tonnes and price', () => {
    expect(recordSale.request({ cropId: 'grau', date, totalLei: 42_000 }).path).toBe('/api/sales');
    expect(() => recordSale.request({ cropId: 'grau', date, tonnes: 40, pricePerKgLei: 1.05 })).not.toThrow();
  });

  it('refuses a sale with no amount, a half amount, or both', () => {
    expect(() => recordSale.request({ cropId: 'grau', date })).toThrow();
    expect(() => recordSale.request({ cropId: 'grau', date, tonnes: 40 })).toThrow();
    expect(() => recordSale.request({ cropId: 'grau', date, totalLei: 1, tonnes: 1, pricePerKgLei: 1 })).toThrow();
  });

  it('refuses a bad date or category', () => {
    expect(() => recordSale.request({ cropId: 'grau', date: '2027-02-31', totalLei: 1 })).toThrow();
    expect(() => addExpense.request({ category: 'nope' as 'other', amountLei: 1, date })).toThrow();
  });

  it('builds an expense with an optional envelope', () => {
    const body = { category: 'diesel', amountLei: 900, date, envelope: 'spring_inputs' } as const;
    expect(addExpense.request(body)).toEqual({ method: 'POST', path: '/api/expenses', body });
  });

  it('undo is a tap only: the AI can never call it', () => {
    expect(undoTransaction.access).toBe('user');
    const id = '11111111-1111-4111-8111-111111111111';
    expect(undoTransaction.request({ id })).toEqual({ method: 'DELETE', path: `/api/transactions/${id}` });
  });
});

describe('tasks', () => {
  it('lists deadlines soonest first, with no past ones', () => {
    const tasks = listTasks.execute({}, ctx).data!;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.map((t) => t.date)).toEqual(tasks.map((t) => t.date).sort());
    expect(tasks[0]!.date >= '2027-03-01').toBe(true);
  });

  it('moves a finished task from open to done, for that year only', () => {
    const first = listTasks.execute({}, ctx).data![0]!;
    const c = { ...ctx, farm: { ...farm, task_completions: [{ task_id: first.id }] } };
    expect(listTasks.execute({}, c).data!.map((t) => t.id)).not.toContain(first.id);
    expect(listTasks.execute({ status: 'done' }, c).data!.map((t) => t.id)).toEqual([first.id]);
    expect(listTasks.execute({ status: 'all' }, c).data!.length).toBe(listTasks.execute({}, ctx).data!.length);
  });

  it('builds the task calls and refuses a made-up id', () => {
    const id = 'apia-cerere:2027';
    expect(completeTask.request({ id })).toEqual({ method: 'PUT', path: '/api/tasks/apia-cerere%3A2027' });
    expect(reopenTask.request({ id }).method).toBe('DELETE');
    expect(() => completeTask.request({ id: '../farmers' })).toThrow();
  });
});

describe('update_farm', () => {
  const edit = { name: 'Ion', county: 'TR', age: 56, startBalanceLei: 40_000, parcels: [{ cropId: 'grau', areaHa: 15 }] };

  it('builds the call', () => {
    expect(updateFarm.request(edit)).toEqual({ method: 'PUT', path: '/api/farmers/me', body: edit });
  });

  it('needs the balance, so leaving it out can never reset it to zero', () => {
    const { startBalanceLei: _gone, ...noBalance } = edit;
    expect(UpdateFarmInputSchema.safeParse(noBalance).success).toBe(false);
  });
});

describe('exchange rate functions', () => {
  const rates = { date: '2026-11-06', rates: { RON: 5.3403, USD: 1.1165, GBP: 0.83415 } };
  const c = { ...ctx, today: '2026-11-07', rates };

  it('returns the rates with their date and whether they are old', () => {
    expect(getExchangeRates.execute({}, c).data).toEqual({ ...rates, base: 'EUR', old: false });
    expect(getExchangeRates.execute({}, { ...c, today: '2026-12-01' }).data!.old).toBe(true);
  });

  it('gives null, not a guess, with no rates', () => {
    expect(getExchangeRates.execute({}, ctx).data).toBeNull();
    expect(convertCurrency.execute({ amount: 100, from: 'RON', to: 'EUR' }, ctx).data).toBeNull();
  });

  it('converts whole units and names the rate date', () => {
    expect(convertCurrency.execute({ amount: 534_030, from: 'RON', to: 'EUR' }, c).data).toEqual({
      amount: 100_000,
      currency: 'EUR',
      ratesDate: '2026-11-06',
    });
  });

  it('accepts only the four currencies', () => {
    expect(() => convertCurrency.execute({ amount: 1, from: 'RON', to: 'CHF' }, c)).toThrow();
  });
});
