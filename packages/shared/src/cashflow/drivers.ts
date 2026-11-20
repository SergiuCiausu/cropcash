/* „Ce schimbă cel mai mult prognoza”: every income and cost in the plan's 12 months, ordered by how
   much each one moves the forecast. The effect is measured by leaving it out and working the plan
   out again (docs/calendar-events-plan.md, Part B). The salary is limited by the hardest month, so a
   big sum after that month can matter less than a small one before it; leaving it out shows that. */
import type { AppData } from '../data';
import { parseOccurrenceId } from '../calendar/events';
import type { MonthKey } from './dates';
import type { FarmPlan } from './farm-plan';
import { maxSafeSalary } from './smoothing';
import { finishTimeline, type EntryKind, type Timeline, type TimelineEntry } from './timeline';

export type DriverKind = 'apia_advance' | 'apia_balance' | 'crop_sale' | 'stored_grain' | 'crop_cost' | 'credit' | 'loan_repayment' | 'payroll' | 'rent' | 'rent_in' | 'farmer' | 'excise_refund';

export interface Driver {
  /** Stable key: `apia_advance`, `sale:grau`, `cost:porumb`, `farmer:<event id>`, … */
  key: string;
  kind: DriverKind;
  direction: 'in' | 'out';
  cropId: string | null;
  /** The farmer's event, for `farmer`. */
  eventId: string | null;
  /** The event's title or the cost's description from data. */
  title: string | null;
  /** Sum over the 12 months, medium year (bani, always positive). */
  total: number;
  /** First and last day it falls on. */
  firstDate: string;
  lastDate: string;
  /** How many times it comes in the 12 months. */
  count: number;
  /**
   * How much higher the safe monthly salary is because of it (bani; negative for a cost).
   * Unrounded, so a small sum still shows. Leaving it out of the plan gives the other value.
   */
  salaryEffect: number;
  /** How much higher the lowest balance is because of it (bani; negative for a cost). */
  lowestEffect: number;
  /** Good year minus bad year (bani, ≥ 0). Zero for sums that don't change with the year. */
  spread: number;
  /** Its spread is large next to its sum (plan-params farmer_events.drivers_unsure_pct). */
  unsure: boolean;
  /** The farmer typed the sum. */
  own: boolean;
  /** It all comes after the month that limits the salary, so it barely moves the salary. */
  afterHardest: boolean;
  /** One of its figures is DE-VERIFICAT. */
  unverified: boolean;
}

export type DriverOrder = 'effect' | 'unsure';

const KIND: Partial<Record<EntryKind, DriverKind>> = {
  apia_advance: 'apia_advance',
  apia_balance: 'apia_balance',
  input_cost: 'crop_cost',
  credit: 'credit',
  loan_repayment: 'loan_repayment',
  /** All the people together: one row, "Salariile oamenilor". */
  payroll: 'payroll',
  /** All the rent paid, with the tax withheld from it: one row, "Arenda". */
  rent: 'rent',
  rent_tax: 'rent',
  rent_in: 'rent_in',
  /** Every quarter's diesel refund together: one row, „Banii înapoi de la motorină”. */
  excise_refund: 'excise_refund',
  farmer_in: 'farmer',
  farmer_out: 'farmer',
};

/** Which driver an entry belongs to. Null for entries with no money. */
export function driverOf(e: TimelineEntry): { key: string; kind: DriverKind } | null {
  if (e.direction === 'none') return null;
  if (e.kind === 'crop_sale') {
    const stored = e.id.startsWith('stored:');
    return { key: `${stored ? 'stored' : 'sale'}:${e.cropId ?? ''}`, kind: stored ? 'stored_grain' : 'crop_sale' };
  }
  const kind = KIND[e.kind];
  if (!kind) return null;
  if (kind === 'crop_cost') return { key: `cost:${e.cropId ?? ''}`, kind };
  if (kind === 'farmer') return { key: `farmer:${parseOccurrenceId(e.id)?.eventId ?? e.id}`, kind };
  return { key: kind, kind };
}

const sumsByDriver = (t: Timeline) => {
  const out = new Map<string, number>();
  for (const e of t.months.flatMap((m) => m.entries)) {
    const d = driverOf(e);
    if (d) out.set(d.key, (out.get(d.key) ?? 0) + e.value);
  }
  return out;
};

/**
 * The plan's drivers, largest effect first. With a fixed salary the lowest balance leads, because
 * the salary itself won't move; the salary effect is still there for the row's note.
 */
export function planDrivers(plan: FarmPlan, data: AppData, options: { order?: DriverOrder; cropId?: string | null } = {}): Driver[] {
  const t = plan.timelines.medium;
  const keys: MonthKey[] = t.months.map((m) => m.key);
  const all = t.months.flatMap((m) => m.entries);
  const base = maxSafeSalary(t, plan.smoothing, data);
  const good = sumsByDriver(plan.timelines.good);
  const bad = sumsByDriver(plan.timelines.bad);
  const unsurePct = data.params.farmer_events.drivers_unsure_pct.value;

  const groups = new Map<string, { kind: DriverKind; entries: TimelineEntry[] }>();
  for (const e of all) {
    const d = driverOf(e);
    if (!d || e.value <= 0) continue;
    if (!groups.has(d.key)) groups.set(d.key, { kind: d.kind, entries: [] });
    groups.get(d.key)!.entries.push(e);
  }

  const drivers: Driver[] = [];
  for (const [key, { kind, entries }] of groups) {
    const first = entries[0]!;
    if (options.cropId && first.cropId !== options.cropId) continue;
    const ids = new Set(entries.map((e) => e.id));
    const without = finishTimeline(
      all.filter((e) => !ids.has(e.id)),
      keys,
      t.startBalance,
    );
    const salaryWithout = maxSafeSalary(without, plan.smoothing, data);
    const total = entries.reduce((s, e) => s + e.value, 0);
    const spread = Math.abs((good.get(key) ?? 0) - (bad.get(key) ?? 0));
    const dates = entries.map((e) => e.date).sort();
    drivers.push({
      key,
      kind,
      direction: first.direction as 'in' | 'out',
      cropId: first.cropId ?? null,
      eventId: kind === 'farmer' ? key.slice('farmer:'.length) : null,
      // A payroll row is everyone together, so it has no one person's name.
      title: kind === 'payroll' || kind === 'rent' || kind === 'rent_in' ? null : (first.what ?? null),
      total,
      firstDate: dates[0]!,
      lastDate: dates[dates.length - 1]!,
      count: entries.length,
      salaryEffect: Math.round(base.exact - salaryWithout.exact),
      lowestEffect: t.lowest.balance - without.lowest.balance,
      spread,
      unsure: total > 0 && (spread * 100) / total >= unsurePct,
      own: kind === 'farmer',
      afterHardest: !!base.bindingMonth && dates[0]!.slice(0, 7) > base.bindingMonth,
      unverified: entries.some((e) => e.unverified),
    });
  }

  const fixed = plan.salaryFixed != null;
  const by = (f: (d: Driver) => number) => (a: Driver, b: Driver) => Math.abs(f(b)) - Math.abs(f(a));
  const chain =
    options.order === 'unsure'
      ? [by((d) => d.spread), by((d) => d.salaryEffect), by((d) => d.total)]
      : fixed
        ? [by((d) => d.lowestEffect), by((d) => d.salaryEffect), by((d) => d.total)]
        : [by((d) => d.salaryEffect), by((d) => d.lowestEffect), by((d) => d.total)];
  return drivers.sort((a, b) => {
    for (const f of chain) {
      const c = f(a, b);
      if (c !== 0) return c;
    }
    return a.key.localeCompare(b.key);
  });
}
