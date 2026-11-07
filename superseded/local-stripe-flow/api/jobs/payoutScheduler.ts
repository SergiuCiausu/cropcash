import {
  addMonths,
  buildFarmPlan,
  firstDay,
  monthKey,
  plannedForMonth,
  type AppData,
  type SubsidyParams,
} from '@cropcash/shared';
import { MAX_CLOCK_STEP_MONTHS, type IncomeKind, type StripeGateway } from '../stripe/gateway';
import type { Ledger } from '../stripe/ledger';

export interface MoneyDeps {
  gateway: StripeGateway;
  ledger: Ledger;
  data: AppData;
  params: SubsidyParams;
}

const noon = (date: string) => `${date}T12:00:00Z`;
const INCOME_KINDS = new Set<string>(['apia_advance', 'apia_balance', 'crop_sale']);

/** The same day, n months on, kept inside shorter months. */
export function addMonthsToDate(date: string, n: number): string {
  const month = addMonths(monthKey(date), n);
  const [year, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), lastDay)).padStart(2, '0')}`;
}

/** Salary day is the 1st, so the months to run are those whose 1st falls after `from`, up to `to`. */
export function salaryMonths(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = addMonths(monthKey(from), 1); firstDay(m) <= to; m = addMonths(m, 1)) months.push(m);
  return months;
}

/**
 * The salary holds steady: it's recalculated when real income arrives, and it only drops between
 * incomes if the money would otherwise run out (docs/07 §4).
 */
export function salaryToPay(safe: number, previous: number | null, incomeArrived: boolean): number {
  if (previous === null || safe < previous || incomeArrived) return safe;
  return previous;
}

/** One month of the demo. Safe to repeat: nothing is paid or booked twice. */
export async function runMonth({ gateway, ledger, data, params }: MoneyDeps, farmerId: string, month: string) {
  const farm = await ledger.farmById(farmerId);
  if (!farm?.stripe_account_id) throw new Error(`farmer ${farmerId} has no Stripe account`);
  const accountId = farm.stripe_account_id;
  const { day, income, costs } = plannedForMonth(farm, data, month, params);

  for (const e of income.filter((i) => INCOME_KINDS.has(i.kind))) {
    const objectId = await gateway.sendIncome({
      accountId,
      farmerId,
      amount: e.value,
      kind: e.kind as IncomeKind,
      key: `income-${farmerId}-${e.id}`,
      cropId: e.cropId,
    });
    await ledger.applyIncome({ farmerId, amountBani: e.value, at: noon(day), category: e.kind, cropId: e.cropId, objectId });
  }
  for (const e of costs) {
    await ledger.applyPlannedCost({
      farmerId,
      amountBani: e.value,
      date: e.date,
      cropId: e.cropId,
      note: e.what,
      key: `planned-${farmerId}-${e.id}`,
    });
  }

  // After this month's money, so the salary reflects it.
  const fresh = await ledger.farmById(farmerId);
  const safe = fresh ? buildFarmPlan(fresh, data, { month, params }).salary.salary : 0;
  const lastPaid = (fresh?.payouts ?? [])
    .filter((p) => p.status !== 'failed' && p.scheduled_for < day)
    .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))[0];
  const salary = salaryToPay(safe, lastPaid?.amount_bani ?? null, income.length > 0);
  if (salary <= 0) return;
  const claimed = await ledger.claimPayout(farmerId, salary, day);
  if (!claimed) return;
  const payoutId = await gateway.payOut({ accountId, amount: salary, month, key: `salary-${farmerId}-${month}` });
  await ledger.markPayout(claimed, payoutId);
}

/** Moves the clock in the steps Stripe allows, running each salary day passed on the way. */
export async function advanceFarm(deps: MoneyDeps, farmerId: string, clockId: string, from: string, months: number) {
  const target = addMonthsToDate(from, months);
  let current = from;
  while (current < target) {
    const stepped = addMonthsToDate(current, MAX_CLOCK_STEP_MONTHS);
    const next = stepped < target ? stepped : target;
    await deps.gateway.advanceClock(clockId, next);
    for (const month of salaryMonths(current, next)) {
      await runMonth(deps, farmerId, month);
      await deps.ledger.setAppDate(farmerId, firstDay(month));
    }
    await deps.ledger.setAppDate(farmerId, next);
    current = next;
  }
}
