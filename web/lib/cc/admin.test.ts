import { describe, expect, it } from 'vitest';
import { applyOverrides, factorFor, loadData, type Override } from '../../../packages/shared/src/data/index';
import {
  checkSet,
  clearDraft,
  comparePlans,
  draftChanges,
  draftSet,
  factorRows,
  parseValue,
  publishErrorText,
  readDraft,
  reasonError,
  saveDraft,
  showValue,
  pairMonths,
  planSideOf,
  whereOf,
} from './admin';
import { planSummary } from '../../../packages/shared/src/cashflow/plan-diff';
import { readFarmState } from './farm';
import { farmView } from './plan';
import { memoryStore } from './storage';

/* The admin panel's logic (docs/admin-panel-plan.md step 6). */

const WHEAT_COST = 'crops.crops[id=grau].cost_lei_per_ha.mean';
const WHEAT_COST_MAX = 'crops.crops[id=grau].cost_lei_per_ha.max';
const data = loadData();
const wheat = data.crops.crops.find((c) => c.id === 'grau')!;
const change = (path: string, value: Override['value'], reason = 'Agro-Info, nov. 2026'): Override => ({ path, value, reason });
const factor = (path: string) => factorFor(path)!;
const NOW = new Date('2026-11-15T10:00:00Z');

describe('the figures listed', () => {
  it('say what they pick, in words', () => {
    expect(whereOf(WHEAT_COST)).toBe(wheat.name_ro);
    expect(whereOf('subsidies.schemes[code=PD-01].amount_eur')).toMatch(/PD-01$/);
    expect(whereOf('crops.crops[id=grau].expense_months[month=3].share_pct')).toBe(`${wheat.name_ro} · martie`);
    expect(whereOf('history.schemes.PD-01.actual[year=2025].value')).toBe('PD-01 · 2025');
    expect(whereOf('params.salary_round_lei.value')).toBe('');
  });

  it('carry the file value, the value in force and why', () => {
    const rows = factorRows([change(WHEAT_COST, 4800)]);
    const row = rows.find((r) => r.path === WHEAT_COST)!;
    expect(row).toMatchObject({ fileValue: wheat.cost_lei_per_ha.mean, value: 4800, reason: 'Agro-Info, nov. 2026' });
    const other = rows.find((r) => r.path === WHEAT_COST_MAX)!;
    expect(other.value).toBe(other.fileValue);
    expect(other.reason).toBeNull();
  });

  it('show their unit the way it reads', () => {
    expect(showValue(factor(WHEAT_COST), 4800)).toBe('4800 lei/ha');
    expect(showValue(factor('crops.crops[id=grau].price_lei_per_kg.mean'), 1.05)).toBe('1,05 lei/kg');
    expect(showValue(factor('crops.crops[id=grau].sale_month_default'), 7)).toBe('iulie');
    expect(showValue(factor('params.forecast.entry_day.value'), 15)).toBe('ziua 15');
    expect(showValue(factor('subsidies.schemes[code=PD-01].enabled'), false)).toBe('nu');
    expect(showValue(factor('params.forecast.years.bad.yield'), 'min')).toBe('cel mai mic');
    expect(showValue(factor('subsidies.schemes[code=PD-01].amount_eur'), null)).toBe('fără cifră');
  });
});

describe('what the admin types', () => {
  it('takes a comma or a point and keeps to the decimals and limits', () => {
    const price = factor('crops.crops[id=grau].price_lei_per_kg.mean');
    expect(parseValue(price, '1,15')).toEqual({ ok: true, value: 1.15 });
    expect(parseValue(price, '1.15')).toEqual({ ok: true, value: 1.15 });
    expect(parseValue(price, '1,155')).toMatchObject({ ok: false });
    expect(parseValue(factor(WHEAT_COST), '4800,5')).toMatchObject({ ok: false, error: 'Scrie un număr întreg.' });
    expect(parseValue(factor('params.forecast.plan_months.value'), '40')).toMatchObject({ ok: false, error: 'Între 1 și 36.' });
    expect(parseValue(factor(WHEAT_COST), 'mult')).toMatchObject({ ok: false });
    expect(parseValue(factor(WHEAT_COST), '-5')).toMatchObject({ ok: false, error: 'Cel puțin 0.' });
  });

  it('an empty field is "no figure" only where the file allows one', () => {
    expect(parseValue(factor('subsidies.schemes[code=PD-01].amount_eur'), '')).toEqual({ ok: true, value: null });
    expect(parseValue(factor(WHEAT_COST), '')).toMatchObject({ ok: false });
  });

  it('a choice must be one of the list', () => {
    expect(parseValue(factor('params.forecast.years.bad.yield'), 'mean')).toEqual({ ok: true, value: 'mean' });
    expect(parseValue(factor('params.forecast.years.bad.yield'), 'worst')).toMatchObject({ ok: false });
    expect(parseValue(factor('history.range_policy.fallback_scheme'), 'PD-01')).toEqual({ ok: true, value: 'PD-01' });
  });

  it('a change needs a reason', () => {
    expect(reasonError('')).not.toBeNull();
    expect(reasonError('  ab ')).not.toBeNull();
    expect(reasonError('Agro-Info')).toBeNull();
  });
});

describe('the draft', () => {
  const rows = factorRows([change(WHEAT_COST, 4800)]);

  it('publishes the whole set: the published changes with the draft on top', () => {
    const set = draftSet(rows, [change(WHEAT_COST, 4800)], { [WHEAT_COST_MAX]: { value: 9000, reason: ' MADR 2026 ' } });
    expect(set).toEqual([change(WHEAT_COST_MAX, 9000, 'MADR 2026'), change(WHEAT_COST, 4800)]);
  });

  it("setting a figure back to the file's drops its change", () => {
    const set = draftSet(rows, [change(WHEAT_COST, 4800)], { [WHEAT_COST]: { value: wheat.cost_lei_per_ha.mean, reason: '' } });
    expect(set).toEqual([]);
    const [c] = draftChanges(rows, { [WHEAT_COST]: { value: wheat.cost_lei_per_ha.mean, reason: '' } });
    expect(c).toMatchObject({ before: 4800, after: wheat.cost_lei_per_ha.mean, backToFile: true });
  });

  it('lists only what differs from the figures in force', () => {
    expect(draftChanges(rows, { [WHEAT_COST]: { value: 4800, reason: 'x' } })).toEqual([]);
  });

  it('stays on the phone until it is thrown away, and a damaged one counts as none', () => {
    const store = memoryStore();
    saveDraft(store, { base: 2, edits: { [WHEAT_COST]: { value: 4900, reason: 'Agro-Info' } } });
    expect(readDraft(store)).toEqual({ base: 2, edits: { [WHEAT_COST]: { value: 4900, reason: 'Agro-Info' } } });
    clearDraft(store);
    expect(readDraft(store)).toBeNull();
    expect(readDraft(memoryStore({ 'cropcash-admin-draft': '{"base":"x"}' }))).toBeNull();
    expect(readDraft(memoryStore({ 'cropcash-admin-draft': '{"base":1,"edits":{"a":{"value":{},"reason":"r"}}}' }))).toEqual({ base: 1, edits: {} });
  });
});

describe('the checks before publishing', () => {
  it('give the data a good draft builds', () => {
    const r = checkSet([change(WHEAT_COST, 4800)]);
    expect(r.ok && r.data.crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean).toBe(4800);
  });

  it('say in Romanian which figure is wrong and why', () => {
    const r = checkSet([change(WHEAT_COST, wheat.cost_lei_per_ha.max + 1)]);
    expect(r).toMatchObject({ ok: false, error: 'Cel mai mic, mijlociu și cel mai mare trebuie să urce în ordinea asta.' });
    const months = wheat.expense_months!;
    const shares = checkSet([change(`crops.crops[id=grau].expense_months[month=${months[0]!.month}].share_pct`, months[0]!.share_pct + 5)]);
    expect(shares).toMatchObject({ ok: false, error: expect.stringMatching(/^Părțile din cheltuieli pe luni trebuie să adune 100%, acum adună 105%\.$/) });
  });

  it('turn a refused publish into words', () => {
    expect(publishErrorText({ status: 0, code: 'offline' })).toMatch(/internet/);
    expect(publishErrorText({ status: 0, code: 'network' })).toMatch(/^Serverul nu a putut fi contactat/);
    expect(publishErrorText({ status: 0, code: 'timeout' })).toMatch(/Verifică istoricul/);
    expect(publishErrorText({ status: 403, code: 'not_an_admin' })).toMatch(/administrator/);
    expect(publishErrorText({ status: 400, code: 'invalid_override', body: { code: 'check_failed', path: WHEAT_COST, message: 'the monthly shares add up to 90%, not 100%' } })).toBe(
      `Părțile din cheltuieli pe luni trebuie să adune 100%, acum adună 90%. (${WHEAT_COST})`,
    );
  });
});

describe('the preview', () => {
  it("works out Ion's farm with the draft the way the API would, saving nothing", () => {
    const store = memoryStore();
    const draft = applyOverrides([change(WHEAT_COST, wheat.cost_lei_per_ha.max)]);
    const before = planSideOf(readFarmState('demo', store, data, NOW), NOW)!;
    const after = planSideOf(readFarmState('demo', store, draft, NOW), NOW)!;
    const p = comparePlans(before, after)!;
    expect(p.changed).toContain('lowest');
    expect(p.after.lowest.balance).toBeLessThan(p.before.lowest.balance);
    expect(store.dump()).toEqual({});
  });

  it('matches planSummary on the same farm, and nothing moves', () => {
    const state = readFarmState('demo', memoryStore(), data, NOW);
    const side = planSideOf(state, NOW)!;
    const view = farmView(state, 'farm');
    expect(side.summary).toEqual(planSummary(view.storedFarm(), view.data(), NOW));
    const p = comparePlans(side, side)!;
    expect(p.changed).toEqual([]);
    expect(p.monthsMoved).toBe(false);
  });

  it('draws the same months as the normal year, ending at the end balance', () => {
    const store = memoryStore();
    const before = planSideOf(readFarmState('demo', store, data, NOW), NOW)!;
    const after = planSideOf(readFarmState('demo', store, applyOverrides([change(WHEAT_COST, wheat.cost_lei_per_ha.max)]), NOW), NOW)!;
    const p = comparePlans(before, after)!;
    expect(p.months.length).toBe(before.months.length);
    expect(p.months.at(-1)!.after).toBe(p.after.endBalance);
    expect(p.monthsMoved).toBe(true);
    expect(Math.min(...p.months.map((m) => m.after!))).toBe(p.after.lowest.balance);
  });

  it('puts two plans of different lengths on one axis', () => {
    expect(pairMonths([{ key: '2026-11', balance: 1 }, { key: '2026-12', balance: 2 }], [{ key: '2026-12', balance: 3 }, { key: '2027-01', balance: 4 }])).toEqual([
      { key: '2026-11', before: 1, after: null },
      { key: '2026-12', before: 2, after: 3 },
      { key: '2027-01', before: null, after: 4 },
    ]);
  });
});
