import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '../calendar/events';
import { loadData } from '../data';
import { planDrivers } from './drivers';
import { buildFarmPlan, longForecast, type PlanFarm } from './farm-plan';

const data = loadData();
const MONTH = '2026-11';
const ion = (over: Partial<PlanFarm> = {}): PlanFarm => ({
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  salary_bani: null,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  transactions: [],
  ...over,
});
const plan = (farm: PlanFarm) => buildFarmPlan(farm, data, { month: MONTH });
const money = (over: Partial<StoredEvent>): StoredEvent => ({
  id: 'rate',
  category: 'money',
  title: 'Rata la bancă',
  starts_on: '2026-11-20',
  repeat: 'monthly',
  direction: 'out',
  amount_bani: 150_000,
  expense_category: 'other',
  ...over,
});

describe('money events in the plan', () => {
  it('a monthly rate lowers the safe salary and shows each month', () => {
    const before = plan(ion());
    const after = plan(ion({ farm_events: [money({})] }));
    const rows = after.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind === 'farmer_out');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ id: 'ev:rate:2026-11-20', value: 150_000, what: 'Rata la bancă', unverified: false });
    expect(after.salary.exact).toBeLessThan(before.salary.exact);
    // Spread evenly, a rate of 1.500 lei a month costs at most 1.500 lei of salary.
    expect(before.salary.exact - after.salary.exact).toBeLessThanOrEqual(150_000);
  });

  it('a planned seed bill replaces the estimate instead of adding to it', () => {
    const t = plan(ion()).timelines.medium;
    const cost = t.months.flatMap((m) => m.entries).find((e) => e.kind === 'input_cost' && e.cropId === 'porumb')!;
    const bill = money({ id: 'seed', repeat: 'none', starts_on: cost.date, amount_bani: 10_000, expense_category: 'seeds', crop_id: 'porumb', replaces_estimate: true });
    const after = plan(ion({ farm_events: [bill] })).timelines.medium;
    const month = after.months.find((m) => m.key === cost.date.slice(0, 7))!;
    const before = t.months.find((m) => m.key === cost.date.slice(0, 7))!;
    expect(month.out).toBe(before.out);
    const extra = plan(ion({ farm_events: [{ ...bill, replaces_estimate: false }] })).timelines.medium.months.find((m) => m.key === month.key)!;
    expect(extra.out).toBe(before.out + 10_000);
  });

  it('„toată recolta” takes the crop’s estimated sale off', () => {
    const sale = plan(ion()).timelines.medium.months.flatMap((m) => m.entries).find((e) => e.kind === 'crop_sale' && e.cropId === 'grau')!;
    const own = money({ id: 'sale', repeat: 'none', direction: 'in', expense_category: null, starts_on: sale.date, amount_bani: 5_000_000, crop_id: 'grau', replaces_estimate: true });
    const entries = plan(ion({ farm_events: [own] })).timelines.medium.months.flatMap((m) => m.entries);
    expect(entries.filter((e) => e.kind === 'crop_sale' && e.cropId === 'grau')).toEqual([]);
    expect(entries.find((e) => e.kind === 'farmer_in')!.value).toBe(5_000_000);
  });

  it('a confirmed or cancelled date isn’t counted', () => {
    const rate = money({ repeat: 'none', farm_event_occurrences: [{ event_id: 'rate', original_date: '2026-11-20', transaction_id: 't' }] });
    const cancelled = money({ id: 'c', repeat: 'none', farm_event_occurrences: [{ event_id: 'c', original_date: '2026-11-20', cancelled: true }] });
    const entries = plan(ion({ farm_events: [rate, cancelled] })).timelines.medium.months.flatMap((m) => m.entries);
    expect(entries.filter((e) => e.kind === 'farmer_out')).toEqual([]);
  });

  it('a yearly event repeats in the long forecast', () => {
    const itp = money({ id: 'itp', repeat: 'yearly', starts_on: '2027-03-01', amount_bani: 50_000 });
    const long = longForecast(ion({ farm_events: [itp] }), data, { month: MONTH });
    const plain = longForecast(ion(), data, { month: MONTH });
    expect(long.medium.length).toBeGreaterThan(1);
    long.medium.forEach((y, i) => expect(plain.medium[i]!.out - y.out).toBe(-50_000));
  });
});

describe('what moves the forecast most', () => {
  it('orders by the salary effect, largest first, with integer bani', () => {
    const list = planDrivers(plan(ion({ farm_events: [money({})] })), data);
    expect(list.length).toBeGreaterThan(3);
    for (let i = 1; i < list.length; i++) expect(Math.abs(list[i - 1]!.salaryEffect)).toBeGreaterThanOrEqual(Math.abs(list[i]!.salaryEffect));
    for (const d of list) {
      expect(Number.isInteger(d.salaryEffect)).toBe(true);
      expect(Math.sign(d.salaryEffect) === 0 || Math.sign(d.salaryEffect) === (d.direction === 'in' ? 1 : -1)).toBe(true);
    }
    const rate = list.find((d) => d.key === 'farmer:rate')!;
    expect(rate).toMatchObject({ own: true, kind: 'farmer', direction: 'out', count: 12, total: 1_800_000, spread: 0, unsure: false });
  });

  it('a cost before the hardest month can outrank a bigger income after it', () => {
    const p = plan(ion());
    const list = planDrivers(p, data);
    const late = list.filter((d) => d.afterHardest && d.direction === 'in');
    for (const d of late) expect(Math.abs(d.salaryEffect)).toBeLessThan(d.total / 12 + 1);
    const binding = p.salary.bindingMonth;
    expect(list.every((d) => d.afterHardest === d.firstDate.slice(0, 7) > binding)).toBe(true);
  });

  it('with a fixed salary the lowest point leads', () => {
    const list = planDrivers(plan(ion({ salary_bani: 300_000 })), data);
    for (let i = 1; i < list.length; i++) expect(Math.abs(list[i - 1]!.lowestEffect)).toBeGreaterThanOrEqual(Math.abs(list[i]!.lowestEffect));
  });

  it('„Cele mai nesigure” sorts by the spread; the crop view keeps one crop', () => {
    const p = plan(ion());
    const unsure = planDrivers(p, data, { order: 'unsure' });
    for (let i = 1; i < unsure.length; i++) expect(unsure[i - 1]!.spread).toBeGreaterThanOrEqual(unsure[i]!.spread);
    expect(planDrivers(p, data, { cropId: 'grau' }).every((d) => d.cropId === 'grau')).toBe(true);
  });

  it('a farm with nothing planned has no drivers', () => {
    expect(planDrivers(plan(ion({ parcels: [], start_balance_bani: 0 })), data)).toEqual(expect.any(Array));
  });
});
