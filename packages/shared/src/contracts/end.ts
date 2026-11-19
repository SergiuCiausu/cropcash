/* When a contract ends and by when the farmer must act (docs/contracts-plan.md §3.1–3.2, docs/16-contracts-law.md).

   A contract runs in terms. The first is startsOn–endsOn. At each end it renews for another term when the farmer
   decided so, or when it renews by itself and nobody decided otherwise (arendă: Codul civil art. 1848; others: only
   when the paper says so, art. 1810 is for leases). A renewal lasts `renewMonths`, or as long as the first term.
   A decision belongs to the first term ending on or after the day it was taken. An archived contract stops at its
   archive day. Pure: no clock, `today` comes in. */
import { addDaysToDate, addMonthsToDate, type IsoDate } from '../cashflow/dates';
import { refuseRenewalBy } from '../arenda/contracts';
import type { ContractDecision } from './model';
import type { AnyContractKind, ContractTypeRule, ContractTypes, EndAction, WithoutDecision } from './types';

/** What end.ts needs of a contract, from either table. */
export interface EndInput {
  kind: AnyContractKind;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  autoRenews: boolean;
  noticeDays: number | null;
  renewMonths: number | null;
  decision: ContractDecision | null;
  decidedOn: IsoDate | null;
  /** The day it was marked as ended (archived); null while in force. */
  archivedOn: IsoDate | null;
  /** Delivery or payment days, for kinds whose deadlines are those days (sale, supply, credit). */
  dueDates: readonly IsoDate[];
}

export interface Term {
  /** 0 for the first term, 1 after one renewal… */
  index: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
}

/** Most renewals walked; a 1-day contract renewing for a century stops here instead of looping. */
const MAX_TERMS = 2_000;

/** Whole months from `a` to `b` (b = a + n months exactly), or null. */
function wholeMonths(a: IsoDate, b: IsoDate): number | null {
  const n = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
  return n > 0 && addMonthsToDate(a, n) === b ? n : null;
}

const daysBetween = (a: IsoDate, b: IsoDate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The k-th term (k ≥ 1) of a contract with an end. Counted from the first term, so short months don't drift. */
function termAt(input: EndInput, k: number): Term {
  const firstEnd = input.endsOn!;
  const restart = addDaysToDate(firstEnd, 1);
  if (input.renewMonths) {
    return { index: k, startsOn: addMonthsToDate(restart, (k - 1) * input.renewMonths), endsOn: addDaysToDate(addMonthsToDate(restart, k * input.renewMonths), -1) };
  }
  const months = wholeMonths(input.startsOn, restart);
  if (months) return { index: k, startsOn: addMonthsToDate(input.startsOn, k * months), endsOn: addDaysToDate(addMonthsToDate(input.startsOn, (k + 1) * months), -1) };
  const days = daysBetween(input.startsOn, restart);
  return { index: k, startsOn: addDaysToDate(input.startsOn, k * days), endsOn: addDaysToDate(input.startsOn, (k + 1) * days - 1) };
}

/** The decision that settles how `term` ends, if any. */
function decisionOf(input: EndInput, term: Term, previous: Term | null): ContractDecision | null {
  if (!input.decision || !input.decidedOn || !term.endsOn) return null;
  if (input.decidedOn > term.endsOn) return null;
  if (previous?.endsOn && input.decidedOn <= previous.endsOn) return null;
  return input.decision;
}

/** Whether a term's end is followed by another term. */
function goesOn(input: EndInput, term: Term, previous: Term | null): boolean {
  const d = decisionOf(input, term, previous);
  if (d === 'renew' || d === 'renegotiate') return true;
  if (d) return false;
  return input.autoRenews;
}

/** The terms from the first one up to the one running on `until` (or the last one, if it stops before). */
export function termsOf(input: EndInput, until: IsoDate): Term[] {
  const out: Term[] = [{ index: 0, startsOn: input.startsOn, endsOn: input.endsOn }];
  for (;;) {
    const last = out[out.length - 1]!;
    if (!last.endsOn || last.endsOn >= until || out.length >= MAX_TERMS) break;
    if (input.archivedOn && input.archivedOn <= last.endsOn) break;
    if (!goesOn(input, last, out[out.length - 2] ?? null)) break;
    out.push(termAt(input, out.length));
  }
  return out;
}

/**
 * The last day the contract runs, looking as far as `until`: null when it still runs then (no end, or renewing
 * past it). An archived contract stops on its archive day.
 */
export function runsUntil(input: EndInput, until: IsoDate): IsoDate | null {
  const terms = termsOf(input, until);
  const last = terms[terms.length - 1]!;
  let end: IsoDate | null = last.endsOn;
  if (end && end >= until && goesOn(input, last, terms[terms.length - 2] ?? null)) end = null;
  if (input.archivedOn && (end === null || input.archivedOn < end)) end = input.archivedOn;
  return end;
}

export type EndStatus = 'running' | 'decide_soon' | 'overdue' | 'renewed' | 'ending' | 'ended';

export interface EndPlan {
  /** The term running today (the first one before the contract starts, the last one after it ends). */
  term: Term;
  /** That term's end; null without one. */
  endsOn: IsoDate | null;
  /** The last day to act: refuse, announce, renew, deliver, pay. Null: nothing to decide now. */
  actBy: IsoDate | null;
  /** From when to remind. */
  remindFrom: IsoDate | null;
  /** False when the act-by day rests on a notice the contract didn't give (the farmer should check the paper). */
  noticeKnown: boolean;
  /** With no decision, the term renews at its end. */
  renewsItself: boolean;
  /** The decision that settles this term, if taken. */
  decision: ContractDecision | null;
  actions: EndAction[];
  /** What the kind does when nobody decides (contract-types.json). */
  withoutDecision: WithoutDecision | null;
  status: EndStatus;
}

const DECIDED_ENDING: readonly ContractDecision[] = ['end', 'buy_out', 'return'];

function actByOf(input: EndInput, rule: ContractTypeRule, term: Term, today: IsoDate): { actBy: IsoDate | null; noticeKnown: boolean } {
  const due = [...input.dueDates].sort();
  switch (rule.act_by) {
    case 'refuse_renewal':
      return { actBy: term.endsOn ? refuseRenewalBy({ starts_on: term.startsOn, ends_on: term.endsOn }) : null, noticeKnown: true };
    case 'end':
      return { actBy: term.endsOn, noticeKnown: true };
    case 'end_minus_notice':
      if (!term.endsOn) return { actBy: null, noticeKnown: input.noticeDays !== null };
      return input.noticeDays === null ? { actBy: term.endsOn, noticeKnown: false } : { actBy: addDaysToDate(term.endsOn, -input.noticeDays), noticeKnown: true };
    case 'each_delivery':
    case 'each_payment':
      return { actBy: due.find((d) => d >= today) ?? null, noticeKnown: true };
    case 'last_repayment':
      return { actBy: due[due.length - 1] ?? null, noticeKnown: true };
    default:
      return { actBy: term.endsOn, noticeKnown: true };
  }
}

function remindFromOf(rule: ContractTypeRule, actBy: IsoDate | null): IsoDate | null {
  if (!actBy) return null;
  if (rule.remind_months_before_act_by) return addMonthsToDate(actBy, -rule.remind_months_before_act_by);
  if (rule.remind_days_before) return addDaysToDate(actBy, -rule.remind_days_before);
  return actBy;
}

/** Where the contract stands on `today` and what the farmer can do. */
export function endPlan(input: EndInput, types: ContractTypes, today: IsoDate): EndPlan {
  const rule = types.types[input.kind];
  const terms = termsOf(input, today);
  const term = terms.find((t) => t.startsOn <= today && (!t.endsOn || today <= t.endsOn)) ?? (today < input.startsOn ? terms[0]! : terms[terms.length - 1]!);
  const previous = terms[term.index - 1] ?? null;
  const decision = decisionOf(input, term, previous);
  const renewsItself = !decision && input.autoRenews && !!term.endsOn;
  const base = { term, endsOn: term.endsOn, decision, actions: rule.actions ?? [], withoutDecision: rule.without_decision ?? null, renewsItself };

  const ended = (input.archivedOn !== null && input.archivedOn <= today) || (term.endsOn !== null && today > term.endsOn);
  if (ended) return { ...base, actBy: null, remindFrom: null, noticeKnown: true, renewsItself: false, status: 'ended' };

  const { actBy, noticeKnown } = actByOf(input, rule, term, today);
  const remindFrom = remindFromOf(rule, actBy);
  const perDue = rule.act_by === 'each_delivery' || rule.act_by === 'each_payment';

  let status: EndStatus;
  if (decision && DECIDED_ENDING.includes(decision)) status = 'ending';
  else if (decision) status = 'running';
  else if (!actBy) status = term.index > 0 ? 'renewed' : 'running';
  else if (today > actBy) status = renewsItself ? 'renewed' : perDue ? 'running' : 'overdue';
  else if (remindFrom && today >= remindFrom) status = 'decide_soon';
  else status = term.index > 0 ? 'renewed' : 'running';

  return { ...base, actBy, remindFrom, noticeKnown, status };
}
