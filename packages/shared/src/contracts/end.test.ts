/* When a contract ends and by when to act (docs/contracts-plan.md §3, docs/16-contracts-law.md). */
import { describe, expect, it } from 'vitest';
import { addDaysToDate, addMonthsToDate } from '../cashflow/dates';
import { loadData } from '../data';
import { endPlan, runsUntil, termsOf, type EndInput } from './end';

const types = loadData().contractTypes;
const input = (over: Partial<EndInput>): EndInput => ({
  kind: 'service',
  startsOn: '2024-01-01',
  endsOn: '2024-12-31',
  autoRenews: false,
  noticeDays: null,
  renewMonths: null,
  decision: null,
  decidedOn: null,
  archivedOn: null,
  dueDates: [],
  ...over,
});
const span = (i: EndInput, until: string) => termsOf(i, until).map((t) => `${t.startsOn}..${t.endsOn}`);

describe('date helpers', () => {
  it('a month on from the 31st falls on the month’s last day, in leap years too', () => {
    expect(addMonthsToDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDate('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonthsToDate('2027-03-31', -1)).toBe('2027-02-28');
    expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDate('2027-03-01', -1)).toBe('2027-02-28');
  });
});

describe('terms', () => {
  it('without an end: one term, it runs on', () => {
    const i = input({ endsOn: null });
    expect(span(i, '2030-01-01')).toEqual(['2024-01-01..null']);
    expect(runsUntil(i, '2030-01-01')).toBeNull();
    expect(endPlan(i, types, '2029-06-01')).toMatchObject({ actBy: null, status: 'running', renewsItself: false });
  });

  it('renewing by itself, renewed twice, for the same length as the first term', () => {
    const i = input({ autoRenews: true });
    expect(span(i, '2026-06-01')).toEqual(['2024-01-01..2024-12-31', '2025-01-01..2025-12-31', '2026-01-01..2026-12-31']);
    expect(runsUntil(i, '2026-06-01')).toBeNull();
    const plan = endPlan(i, types, '2026-06-01');
    expect(plan.term.index).toBe(2);
    // A service gives no notice by law (art. 1277): the act-by day is the end, flagged for the farmer to check.
    expect(plan).toMatchObject({ endsOn: '2026-12-31', actBy: '2026-12-31', noticeKnown: false, remindFrom: '2026-12-01', status: 'renewed', renewsItself: true });
  });

  it('a renewal of `renewMonths`, after a longer first term', () => {
    expect(span(input({ endsOn: '2025-12-31', autoRenews: true, renewMonths: 12 }), '2027-03-01')).toEqual([
      '2024-01-01..2025-12-31',
      '2026-01-01..2026-12-31',
      '2027-01-01..2027-12-31',
    ]);
  });

  it('leap days: a four-year term from 1 March ends on 29 February, and so does the next', () => {
    const i = input({ kind: 'arenda', startsOn: '2024-03-01', endsOn: '2028-02-29', autoRenews: true });
    expect(span(i, '2029-01-01')).toEqual(['2024-03-01..2028-02-29', '2028-03-01..2032-02-29']);
  });

  it('a month-end term stays on month ends, without drifting', () => {
    const i = input({ startsOn: '2027-01-31', endsOn: '2027-02-27', autoRenews: true });
    // 31 Jan + 1 month = 28 Feb: a whole month; then 31 Mar, 30 Apr…
    expect(span(i, '2027-04-15')).toEqual(['2027-01-31..2027-02-27', '2027-02-28..2027-03-30', '2027-03-31..2027-04-29']);
  });

  it('a term that isn’t whole months renews by days', () => {
    expect(span(input({ startsOn: '2026-01-10', endsOn: '2026-03-04', autoRenews: true }), '2026-03-10')).toEqual(['2026-01-10..2026-03-04', '2026-03-05..2026-04-27']);
  });

  it('a decision to end stops the term it was taken in; one to renew carries a contract that doesn’t renew by itself', () => {
    const ended = input({ autoRenews: true, decision: 'end', decidedOn: '2025-06-01' });
    expect(span(ended, '2027-01-01')).toEqual(['2024-01-01..2024-12-31', '2025-01-01..2025-12-31']);
    expect(runsUntil(ended, '2027-01-01')).toBe('2025-12-31');
    expect(endPlan(ended, types, '2025-07-01').status).toBe('ending');
    expect(endPlan(ended, types, '2026-03-01').status).toBe('ended');

    const renewed = input({ decision: 'renew', decidedOn: '2024-11-20' });
    expect(span(renewed, '2026-06-01')).toEqual(['2024-01-01..2024-12-31', '2025-01-01..2025-12-31']);
    expect(runsUntil(renewed, '2026-06-01')).toBe('2025-12-31');
  });

  it('an archived contract stops on its archive day', () => {
    const i = input({ autoRenews: true, archivedOn: '2025-03-10' });
    expect(runsUntil(i, '2027-01-01')).toBe('2025-03-10');
    expect(endPlan(i, types, '2025-03-10').status).toBe('ended');
    expect(endPlan(i, types, '2025-03-09').status).toBe('renewed');
  });
});

describe('by when to act, per kind', () => {
  it('arendă: refuse in writing a year before the end (art. 1848), reminded a month before that', () => {
    const arenda = input({ kind: 'arenda', startsOn: '2021-10-01', endsOn: '2026-09-30', autoRenews: true });
    expect(endPlan(arenda, types, '2025-07-01')).toMatchObject({ actBy: '2025-09-30', remindFrom: '2025-08-30', status: 'running' });
    expect(endPlan(arenda, types, '2025-09-01')).toMatchObject({ status: 'decide_soon', actions: ['let_renew', 'refuse', 'renegotiate'] });
    // Past the refusal day it renews; no say until the next term.
    expect(endPlan(arenda, types, '2025-10-15')).toMatchObject({ status: 'renewed', renewsItself: true });
    expect(endPlan(arenda, types, '2026-10-15')).toMatchObject({ endsOn: '2031-09-30', actBy: '2030-09-30', status: 'renewed' });
  });

  it('arendă of a year: six months before the end', () => {
    expect(endPlan(input({ kind: 'arenda', startsOn: '2026-01-01', endsOn: '2026-12-31', autoRenews: true }), types, '2026-02-01').actBy).toBe('2026-06-30');
  });

  it('insurance: act by its last day; after it, uninsured (it doesn’t renew by itself)', () => {
    const policy = input({ kind: 'insurance', startsOn: '2026-01-01', endsOn: '2026-12-31', noticeDays: 20 });
    expect(endPlan(policy, types, '2026-11-20')).toMatchObject({ actBy: '2026-12-31', remindFrom: '2026-11-16', status: 'decide_soon', withoutDecision: 'uninsured' });
    expect(endPlan(policy, types, '2027-01-02')).toMatchObject({ status: 'ended', actBy: null });
  });

  it('leasing: the notice from the paper; past it with no choice, overdue; bought out, ending', () => {
    const leasing = input({ kind: 'leasing', startsOn: '2023-07-01', endsOn: '2027-06-30', noticeDays: 30 });
    expect(endPlan(leasing, types, '2027-04-15')).toMatchObject({ actBy: '2027-05-31', remindFrom: '2027-04-01', status: 'decide_soon' });
    expect(endPlan(leasing, types, '2027-06-10').status).toBe('overdue');
    expect(endPlan({ ...leasing, decision: 'buy_out', decidedOn: '2027-05-20' }, types, '2027-06-10')).toMatchObject({ status: 'ending', decision: 'buy_out' });
  });

  it('a sale: each delivery day, reminded two weeks before; no overdue (deliveries are noted in step 5)', () => {
    const sale = input({ kind: 'sale', startsOn: '2027-01-01', endsOn: '2027-08-31', dueDates: ['2027-08-10', '2027-07-15'] });
    expect(endPlan(sale, types, '2027-07-05')).toMatchObject({ actBy: '2027-07-15', remindFrom: '2027-07-01', status: 'decide_soon' });
    expect(endPlan(sale, types, '2027-07-20')).toMatchObject({ actBy: '2027-08-10', status: 'running' });
  });

  it('supply: each payment day, reminded two weeks before; the plan keeps the payment', () => {
    const supply = input({ kind: 'supply', startsOn: '2027-02-01', endsOn: '2027-08-31', dueDates: ['2027-08-20', '2027-03-10'] });
    expect(endPlan(supply, types, '2027-03-01')).toMatchObject({ actBy: '2027-03-10', remindFrom: '2027-02-24', status: 'decide_soon', actions: ['pay', 'pay_in_kind'], withoutDecision: 'keeps_payment' });
    expect(endPlan(supply, types, '2027-03-15')).toMatchObject({ actBy: '2027-08-20', remindFrom: '2027-08-06', status: 'running' });
  });

  it('comodat: act by its last day, reminded 60 days before; then it ends', () => {
    const comodat = input({ kind: 'comodat', startsOn: '2024-04-01', endsOn: '2027-03-31' });
    expect(endPlan(comodat, types, '2027-02-15')).toMatchObject({ actBy: '2027-03-31', remindFrom: '2027-01-30', status: 'decide_soon', actions: ['new_contract', 'hand_back'], withoutDecision: 'ends' });
    expect(endPlan(comodat, types, '2027-04-01').status).toBe('ended');
  });

  it('credit: the last repayment, nothing to choose', () => {
    const credit = input({ kind: 'credit', startsOn: '2026-07-15', endsOn: '2028-01-15', dueDates: ['2027-01-15', '2028-01-15', '2027-07-15'] });
    expect(endPlan(credit, types, '2027-06-01')).toMatchObject({ actBy: '2028-01-15', status: 'running', actions: [] });
    expect(endPlan(credit, types, '2027-12-20')).toMatchObject({ remindFrom: '2027-12-16', status: 'decide_soon' });
  });

  it('other: the paper’s notice; renewing by itself past it, overdue when it doesn’t', () => {
    const other = input({ kind: 'other', startsOn: '2027-01-01', endsOn: '2027-12-31', noticeDays: 30, autoRenews: true });
    expect(endPlan(other, types, '2027-11-15')).toMatchObject({ actBy: '2027-12-01', remindFrom: '2027-11-01', noticeKnown: true, status: 'decide_soon', actions: ['let_continue', 'announce_end', 'renegotiate'] });
    expect(endPlan(other, types, '2027-12-05')).toMatchObject({ status: 'renewed', renewsItself: true });
    expect(endPlan({ ...other, autoRenews: false }, types, '2027-12-05')).toMatchObject({ status: 'overdue', renewsItself: false });
  });

  it('employment (no rule yet, C3): its end is the act-by day, no actions offered', () => {
    expect(endPlan(input({ kind: 'employment', startsOn: '2027-03-01', endsOn: '2027-06-30' }), types, '2027-06-01')).toMatchObject({ actBy: '2027-06-30', remindFrom: '2027-06-30', status: 'running', actions: [] });
  });

  it('before it starts: the first term, running', () => {
    expect(endPlan(input({ startsOn: '2027-01-01', endsOn: '2027-12-31' }), types, '2026-11-18')).toMatchObject({ status: 'running', endsOn: '2027-12-31' });
  });
});
