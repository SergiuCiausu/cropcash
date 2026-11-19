/* A contract's money schedule as dated flows (docs/contracts-plan.md §2.2, §5.1). Pure.

   - A one-off payment is kept on its own day, even before the contract starts (an advance at signing).
   - A repeating one runs `times` times, or until the contract stops. It never runs past the day the contract
     stops (end without renewal, decision to end, archived), so a renewal keeps a yearly premium going and an
     ended contract stops it.
   - Each repeat is counted from the first day, so a monthly 31st falls on 28/29 Feb and back on 31 Mar.
   - A per-ha amount needs the contract's hectares; without them the amount is null (unknown), never 0.
   - Amounts are without VAT; taxes come apart (step 3). */
import { addMonthsToDate, type IsoDate } from '../cashflow/dates';
import { areaTimesRate, type Ari, type Bani } from '../money';
import type { PaymentDirection, PaymentRepeat, StoredContractPayment, StoredFarmContract } from './model';

export interface ContractFlow {
  contractId: string;
  source: 'contract' | 'arenda';
  /** The schedule row; null for arendă rent and a leasing's residual value. */
  paymentId: string | null;
  date: IsoDate;
  direction: PaymentDirection;
  /** Bani without VAT; null when it can't be known (per ha with no hectares). */
  amountBani: Bani | null;
  /** Paid or delivered in kind, with its crop; 0 and null when none. */
  kg: number;
  cropId: string | null;
  label: string | null;
}

const STEP_MONTHS: Record<Exclude<PaymentRepeat, 'none'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** The days a schedule row falls on inside [from, to], never after `stopOn` (null: runs past `to`). */
export function paymentDates(p: Pick<StoredContractPayment, 'first_on' | 'repeat' | 'times'>, stopOn: IsoDate | null, from: IsoDate, to: IsoDate): IsoDate[] {
  if (p.repeat === 'none') return p.first_on >= from && p.first_on <= to ? [p.first_on] : [];
  const step = STEP_MONTHS[p.repeat];
  const count = p.times ?? Infinity;
  // Start near `from` so a long schedule doesn't walk every past month.
  const gap = (Number(from.slice(0, 4)) - Number(p.first_on.slice(0, 4))) * 12 + (Number(from.slice(5, 7)) - Number(p.first_on.slice(5, 7)));
  const out: IsoDate[] = [];
  for (let k = Math.max(0, Math.floor(gap / step) - 1); k < count; k++) {
    const d = addMonthsToDate(p.first_on, k * step);
    if (d > to || (stopOn && d > stopOn)) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** One occurrence's amount: the row's, or per ha times the contract's area. */
export function paymentAmount(p: Pick<StoredContractPayment, 'amount_bani' | 'per_ha'>, areaAri: Ari | null): Bani | null {
  if (p.amount_bani === null) return null;
  if (!p.per_ha) return p.amount_bani;
  return areaAri === null ? null : areaTimesRate(areaAri, p.amount_bani);
}

/** By day; on the same day the schedule's rows first, a residual value after the last rate. */
const byDate = (a: ContractFlow, b: ContractFlow) =>
  a.date.localeCompare(b.date) ||
  a.contractId.localeCompare(b.contractId) ||
  Number(a.paymentId === null) - Number(b.paymentId === null) ||
  (a.paymentId ?? '').localeCompare(b.paymentId ?? '');

/**
 * A contract's flows inside [from, to]. `stopOn`: the last day it runs (end.ts `runsUntil`), null when it runs
 * past `to`. A leasing decided as bought out adds its residual value on the last day.
 */
export function farmContractFlows(
  c: Pick<StoredFarmContract, 'id' | 'kind' | 'area_ari' | 'residual_bani' | 'decision'>,
  payments: readonly StoredContractPayment[],
  stopOn: IsoDate | null,
  from: IsoDate,
  to: IsoDate,
): ContractFlow[] {
  const out: ContractFlow[] = [];
  for (const p of payments) {
    if (p.contract_id !== c.id) continue;
    const amountBani = paymentAmount(p, c.area_ari);
    for (const date of paymentDates(p, p.repeat === 'none' ? null : stopOn, from, to))
      out.push({ contractId: c.id, source: 'contract', paymentId: p.id, date, direction: p.direction, amountBani, kg: p.kg ?? 0, cropId: p.crop_id, label: p.label });
  }
  if (c.kind === 'leasing' && c.decision === 'buy_out' && c.residual_bani && stopOn && stopOn >= from && stopOn <= to)
    out.push({ contractId: c.id, source: 'contract', paymentId: null, date: stopOn, direction: 'out', amountBani: c.residual_bani, kg: 0, cropId: null, label: 'residual' });
  return out.sort(byDate);
}
