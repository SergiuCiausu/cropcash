import type { Bani } from '../money';
import { applyPct } from '../money';
import type { Timeline } from './timeline';

/** The database enum still has 'risk_fund', from the bad-year fund that was removed. It is never used. */
export type EnvelopeKind = 'spring_inputs' | 'debts' | 'salary' | 'pension';
export const ENVELOPE_KINDS: EnvelopeKind[] = ['salary', 'spring_inputs', 'debts', 'pension'];

export type Envelopes = Record<EnvelopeKind, Bani>;

export interface AllocationInput {
  /** Money to split (bani). */
  amount: Bani;
  /** Is this money an income (APIA, harvest)? */
  isIncome: boolean;
  salary: Bani;
  pensionMonthly: Bani;
  /** Months this money has to last: until the next income in the plan (at least 1). */
  monthsCovered: number;
  /** Declared credit repayments due before the next income (bani). */
  debtsDue: Bani;
}

/**
 * Proposes how to split money into envelopes. Order: debts,
 * pension and salary for the months covered, and the rest for farm costs.
 * Nothing is lost: the parts always add up to `amount`.
 */
export function proposeAllocation(a: AllocationInput): Envelopes {
  let left = Math.max(0, a.amount);
  const take = (want: Bani) => {
    const v = Math.max(0, Math.min(want, left));
    left -= v;
    return v;
  };
  const debts = take(a.debtsDue);
  const pension = take(a.pensionMonthly * a.monthsCovered);
  const salary = take(a.salary * a.monthsCovered);
  const spring_inputs = left;
  return { salary, spring_inputs, debts, pension };
}

/**
 * Months from `fromKey` until the month of the next money coming in (min 1).
 * `incomeThisMonthAhead`: true when splitting money already on hand and an income
 * planned in the current month is still to come (then it only has to last this month);
 * false when splitting that very income.
 */
export function monthsUntilNextIncome(t: Timeline, fromKey: string, incomeThisMonthAhead = false): number {
  const start = t.months.findIndex((m) => m.key === fromKey);
  if (start < 0) return 1;
  const next = t.months.findIndex((m, i) => (incomeThisMonthAhead ? i >= start : i > start) && m.in > 0);
  return Math.max(1, (next < 0 ? t.months.length : next) - start);
}
