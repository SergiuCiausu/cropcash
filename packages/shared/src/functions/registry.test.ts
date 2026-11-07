import { describe, expect, it } from 'vitest';
import { upcoming } from '../cashflow';
import { loadData } from '../data';
import type { ReadContext } from './define';
import { buildFarmPlan, proposeSplit } from './plan';
import {
  FUNCTIONS,
  GetPlanInputSchema,
  addCredit,
  checkScheme,
  estimateSubsidy,
  findFunction,
  findRead,
  getEnvelopes,
  getForecast,
  getSalary,
  getSubsidyPayments,
  getTightMonths,
  listCredits,
  listSchemes,
  listUpcoming,
  proposeSplitFn,
  removeCredit,
  saveEnvelopes,
  suggestCreditFn,
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
const plan = buildFarmPlan(farm, data, { month: '2026-11' });
const ctx: ReadContext = { farm, plan, data, today: '2026-11-07' };

describe('registry', () => {
  it('has unique snake_case names and a description for each', () => {
    const names = FUNCTIONS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const f of FUNCTIONS) {
      expect(f.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(f.description.length).toBeGreaterThan(20);
    }
  });

  it('never lets a write run without the farmer', () => {
    const writes = FUNCTIONS.filter((f) => !('execute' in f));
    expect(writes.length).toBeGreaterThanOrEqual(9);
    for (const f of writes) {
      expect(['confirm', 'user']).toContain(f.access);
      expect(f.runs).toBe('api');
      expect(findRead(f.name)).toBeUndefined();
    }
  });

  it('runs every read with no input where none is required, and stamps the date', () => {
    for (const f of FUNCTIONS) {
      if (!('execute' in f) || !f.input.safeParse({}).success) continue;
      const res = f.execute({}, ctx);
      expect(res.asOf).toBe('2026-11-07');
      expect(JSON.parse(JSON.stringify(res))).toEqual(res);
    }
  });

  it('finds functions by name', () => {
    expect(findFunction('get_plan')?.access).toBe('read');
    expect(findFunction('nope')).toBeUndefined();
  });

  it('defaults a scenario to a normal year and refuses anything else', () => {
    expect(GetPlanInputSchema.parse({})).toEqual({ scenario: 'medium' });
    expect(() => getSalary.execute({ scenario: 'great' }, ctx)).toThrow();
    expect(() => getSalary.execute({ extra: 1 }, ctx)).toThrow();
  });
});

describe('subsidy functions', () => {
  it('estimate_subsidy returns the plan subsidy and links its sources', () => {
    const res = estimateSubsidy.execute({}, ctx);
    expect(res.data).toBe(plan.subsidies);
    expect(res.sources.length).toBeGreaterThan(0);
    for (const s of res.sources) expect(s.url).toMatch(/^https?:/);
  });

  it('check_scheme agrees with the subsidy estimate', () => {
    expect(checkScheme.execute({ code: 'PD-01' }, ctx).data?.eligible).toBe(true);
    // PD-04 starts above 10 ha, so a 5 ha farm misses it, with a reason.
    const small = { ...farm, parcels: [{ crop_id: 'grau', area_ari: 500, is_arable: true }] };
    const pd04 = checkScheme.execute({ code: 'PD-04' }, { ...ctx, farm: small }).data!;
    const smallPlan = buildFarmPlan(small, data, { month: '2026-11' });
    expect(pd04.eligible).toBe(false);
    expect(pd04.failed.length).toBeGreaterThan(0);
    expect(smallPlan.subsidies.notEligible.map((n) => n.code)).toContain('PD-04');
  });

  it('check_scheme returns null for an unknown code', () => {
    expect(checkScheme.execute({ code: 'NOPE' }, ctx).data).toBeNull();
  });

  it('check_scheme does not answer yes for schemes outside the app', () => {
    const r = checkScheme.execute({ code: 'CPL-VACI-LAPTE' }, ctx).data;
    expect(r).toMatchObject({ inApp: false, eligible: false });
  });

  it('list_schemes keeps an unknown rate null and hides disabled schemes', () => {
    const list = listSchemes.execute({}, ctx).data!;
    expect(list.find((s) => s.code === 'PD-28')?.amountEur).toBeNull();
    expect(list.some((s) => s.code === 'CPL-VACI-LAPTE')).toBe(false);
  });

  it('get_subsidy_payments only returns APIA payments from the plan', () => {
    const payments = getSubsidyPayments.execute({}, ctx).data!;
    const inPlan = plan.timelines.medium.months.flatMap((m) => m.entries).filter((e) => e.kind.startsWith('apia_'));
    expect(payments).toHaveLength(inPlan.length);
    expect(payments.length).toBeGreaterThan(0);
  });
});

describe('salary and plan functions', () => {
  it('get_salary matches the plan in a normal year and is lower in a bad one', () => {
    expect(getSalary.execute({}, ctx).data).toEqual(plan.salary);
    expect(getSalary.execute({ scenario: 'bad' }, ctx).data!.salary).toBeLessThan(plan.salary.salary);
  });

  it('get_forecast covers 12 months and ends on the last balance', () => {
    const f = getForecast.execute({ scenario: 'good' }, ctx).data!;
    expect(f.months).toHaveLength(12);
    expect(f.endBalance).toBe(plan.timelines.good.months.at(-1)!.balanceEnd);
  });

  it('get_tight_months reports what is missing only below zero', () => {
    const t = getTightMonths.execute({}, ctx).data!;
    expect(t.months).toEqual(plan.timelines.medium.hardMonths);
    expect(t.missing).toBe(Math.max(0, -plan.timelines.medium.lowest.balance));
  });

  it('list_upcoming starts from today and honours days', () => {
    const list = listUpcoming.execute({ days: 90 }, ctx).data!;
    expect(list).toEqual(upcoming(plan.timelines.medium, '2026-11-07', 90));
    expect(() => listUpcoming.execute({ days: 0 }, ctx)).toThrow();
  });
});

describe('credit functions', () => {
  it('suggest_credit repeats the plan suggestion with no target', () => {
    const s = suggestCreditFn.execute({}, ctx).data!;
    expect(s.salary).toBe(295_000);
    expect(s.credit.amount).toBe(1_510_000);
    expect(s.possible).toBe(true);
  });

  it('suggest_credit says when a target is beyond the 90% limit', () => {
    const s = suggestCreditFn.execute({ targetSalary: 800_000 }, ctx).data!;
    expect(s.credit.amount).toBeGreaterThan(s.capacity);
    expect(s.possible).toBe(false);
  });

  it('suggest_credit returns null when no credit is needed', () => {
    expect(suggestCreditFn.execute({ targetSalary: 50_000 }, ctx).data).toBeNull();
  });

  it('list_credits is empty until one is declared', () => {
    expect(listCredits.execute({}, ctx).data).toEqual([]);
  });

  it('add_credit and remove_credit build the API calls and validate first', () => {
    const body = { amountLei: 14_800, takeMonth: '2027-04', repayMonth: '2027-08' };
    expect(addCredit.request(body)).toEqual({ method: 'POST', path: '/api/credits', body });
    expect(() => addCredit.request({ ...body, repayMonth: '2027-01' })).toThrow();
    const groupId = '11111111-1111-4111-8111-111111111111';
    expect(removeCredit.request({ groupId })).toEqual({ method: 'DELETE', path: `/api/credits/${groupId}` });
    expect(() => removeCredit.request({ groupId: '../farmers' })).toThrow();
  });
});

describe('envelope functions', () => {
  it('get_envelopes shows the balances', () => {
    expect(getEnvelopes.execute({}, ctx).data).toEqual({ balances: plan.envelopes });
  });

  it('propose_split defaults to the money on hand', () => {
    expect(proposeSplitFn.execute({}, ctx).data!.split).toEqual(plan.proposal);
  });

  it('propose_split for income loses nothing', () => {
    const { split } = proposeSplitFn.execute({ income: 1_000_000 }, ctx).data!;
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(1_000_000);
    expect(split).not.toHaveProperty('risk_fund');
    expect(proposeSplit(plan, 1_000_000, true).split).toEqual(split);
  });

  it('save_envelopes refuses negative amounts', () => {
    const split = { salary: 1, spring_inputs: 0, debts: 0, pension: 0 };
    expect(saveEnvelopes.request(split)).toEqual({ method: 'PUT', path: '/api/envelopes', body: split });
    expect(() => saveEnvelopes.request({ ...split, salary: -1 })).toThrow();
  });
});
