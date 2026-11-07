import type { AppData } from '../data';
import { computeSubsidies, normalizeParcels } from '../subsidies';
import { extrasFromStored, farmInputFromStored } from '../farm';
import { buildTimeline } from './timeline';
import { computeFarmPlan, planToday, type PlanFarm } from './plan';

/**
 * "Dăm timpul înainte" (docs/08 §4): what happens between two moments of the demo clock.
 * Pure: the API turns these steps into Stripe test payments and payouts.
 */

export type SimStep =
  | {
      type: 'income';
      date: string;
      kind: 'apia_advance' | 'apia_balance' | 'crop_sale' | 'credit';
      amount: number;
      cropId?: string;
      /** For a declared credit: the expected_payments row it settles. */
      paymentId?: string;
    }
  /** A declared credit repaid (from the farmer's bank: recorded, no Stripe). */
  | { type: 'repayment'; date: string; amount: number; paymentId: string }
  | { type: 'salary'; date: string; month: string }
  /** A planned farm cost that is now paid (from the farmer's bank: recorded, no Stripe). */
  | { type: 'expense'; date: string; amount: number; cropId: string; id: string };

/** First days of the months that start in (from, to]: the salary paydays. */
export function paydaysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let [y, m] = fromIso.slice(0, 7).split('-').map(Number) as [number, number];
  for (;;) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const day = `${y}-${String(m).padStart(2, '0')}-01`;
    if (day > toIso.slice(0, 10)) return out;
    out.push(day);
  }
}

/**
 * Incomes that really arrive in (from, to]. Reality is simulated with the "normal year"
 * amounts and payments in the middle of their window, while the plan stays cautious
 * (last day of the window): the demo shows money arriving earlier than planned.
 */
export function incomesBetween(farm: PlanFarm, data: AppData, fromIso: string, toIso: string) {
  const plan = computeFarmPlan(farm, data);
  const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
  const subsidies = computeSubsidies(input, data);
  const months = 13;
  const tl = buildTimeline(
    { parcels: normalizeParcels(input.parcels), subsidies, startBalance: 0, received: plan.received },
    data,
    { start: fromIso.slice(0, 7), months, amounts: 'medium', timing: 'mid' },
  );
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  const dayAfter = new Date(Date.parse(`${from}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return tl.months
    .flatMap((m) => m.entries)
    // A payment whose window is still open but whose middle date has passed arrives next.
    .map((e) => (e.window && e.date <= from && e.window.end > from ? { ...e, date: dayAfter } : e))
    .filter((e) => e.direction === 'in' && e.date > from && e.date <= to)
    .filter((e) => e.kind === 'apia_advance' || e.kind === 'apia_balance' || e.kind === 'crop_sale')
    .map(
      (e): SimStep => ({
        type: 'income',
        date: e.date,
        kind: e.kind as 'apia_advance' | 'apia_balance' | 'crop_sale',
        amount: e.value,
        cropId: e.cropId,
      }),
    );
}

/** Planned farm costs (normal year) dated in (from, to] and not yet paid. */
export function costsBetween(farm: PlanFarm, data: AppData, fromIso: string, toIso: string): SimStep[] {
  const plan = computeFarmPlan(farm, data);
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  return plan.timelines.medium.months
    .flatMap((m) => m.entries)
    .filter((e) => e.kind === 'input_cost' && e.cropId && e.date > from && e.date <= to)
    .map((e): SimStep => ({ type: 'expense', date: e.date, amount: e.value, cropId: e.cropId!, id: e.id }));
}

/**
 * Declared credits and repayments dated in (from, to] and not yet settled. In the demo the
 * credit arrives in the CropCash account like an APIA payment (docs/11 P18).
 */
export function creditsBetween(farm: PlanFarm, fromIso: string, toIso: string): SimStep[] {
  const settled = new Set((farm.transactions ?? []).map((t) => t.expected_payment_id).filter(Boolean));
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  return extrasFromStored(farm.expected_payments ?? [])
    .filter((x) => !settled.has(x.id) && x.date > from && x.date <= to)
    .map(
      (x): SimStep =>
        x.kind === 'credit'
          ? { type: 'income', date: x.date, kind: 'credit', amount: x.amount, paymentId: x.id }
          : { type: 'repayment', date: x.date, amount: x.amount, paymentId: x.id },
    );
}

/** All steps between the demo clock now and `toIso`, in date order (salary first on a tie). */
export function simulationSteps(farm: PlanFarm, data: AppData, toIso: string): SimStep[] {
  const from = farm.demo_now ?? planToday(farm).today;
  const steps: SimStep[] = [
    ...paydaysBetween(from, toIso).map((d): SimStep => ({ type: 'salary', date: d, month: d.slice(0, 7) })),
    ...incomesBetween(farm, data, from, toIso),
    ...costsBetween(farm, data, from, toIso),
    ...creditsBetween(farm, from, toIso),
  ];
  return steps.sort((a, b) => (a.date === b.date ? (a.type === 'salary' ? -1 : 1) : a.date < b.date ? -1 : 1));
}
