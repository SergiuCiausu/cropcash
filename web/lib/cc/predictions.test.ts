import { describe, expect, it, vi } from 'vitest';
import { applyOverrides, loadData, type Override } from '../../../packages/shared/src/data/index';
import { computeFarmPlan, type PlanFarm } from '../../../packages/shared/src/cashflow/plan';
import { memoryStore, type Mode } from './storage';
import { createStore, type LiveCalls } from './store';

/* The admin panel's published changes on the phone (docs/admin-panel-plan.md step 5). */

const NOW = new Date('2026-11-15T10:00:00Z');
const SESSION = { 'sb-test-auth-token': '{}' };
const ME = {
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800 },
    { crop_id: 'porumb', area_ari: 700 },
  ],
  transactions: [],
  task_completions: [],
  pension_plans: [],
  opportunity_follows: [],
};
const data = loadData();
const KEY = 'cropcash-prediction-data';
const WHEAT_COST = 'crops.crops[id=grau].cost_lei_per_ha.mean';
const FILE_COST = data.crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean;
const change = (path: string, value: Override['value']): Override => ({ path, value, reason: 'Agro-Info, nov. 2026' });
const published = (version: number, overrides: Override[], admin = false) => ({ version, overrides, admin });
const copy = (version: number, overrides: Override[], admin = false) => JSON.stringify({ ...published(version, overrides, admin), at: '2026-11-14T08:00:00Z' });

function setup({ mode = 'farm' as Mode, saved = {} as Record<string, string>, online = true, answer = published(0, []) as unknown, fails = false } = {}) {
  const store = memoryStore({ ...SESSION, 'cropcash-me': JSON.stringify(ME), ...saved });
  let net = online;
  let server = answer;
  let down = fails;
  const live: LiveCalls = {
    api: vi.fn(async (path: string) => {
      if (path === '/api/me') return { farmer: ME } as never;
      if (path === '/api/prediction-data') {
        if (down) throw Object.assign(new Error('no answer'), { status: 0, code: 'network' });
        return server as never;
      }
      return {} as never;
    }),
    read: vi.fn(async () => ({ data: [] }) as never),
    write: vi.fn(async () => ({}) as never),
  };
  const s = createStore({
    mode,
    store,
    data,
    live,
    now: () => NOW,
    net: {
      apiUrl: 'http://api.test',
      browserOnline: () => net,
      fetchFn: (async () => ({ ok: net })) as unknown as typeof fetch,
      setTimer: () => 0,
      clearTimer: () => undefined,
    },
  });
  const reads = () => (live.api as ReturnType<typeof vi.fn>).mock.calls.filter(([p]) => p === '/api/prediction-data').length;
  const cost = () => s.getState().farm!.farmData.crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean;
  return {
    s,
    store,
    reads,
    cost,
    setOnline: (v: boolean) => (net = v),
    setServer: (a: unknown) => (server = a),
    setDown: (v: boolean) => (down = v),
  };
}

describe('published changes on a signed-in farm', () => {
  it('are read at start, saved on the phone and used by every figure', async () => {
    const t = setup({ answer: published(3, [change(WHEAT_COST, 4800)], true) });
    await t.s.start();
    expect(t.reads()).toBe(1);
    expect(t.cost()).toBe(4800);
    expect(t.s.getState().predictions).toEqual({ version: 3, admin: true, overrides: [change(WHEAT_COST, 4800)] });
    expect(JSON.parse(t.store.getItem(KEY)!)).toMatchObject({ version: 3, admin: true, at: NOW.toISOString() });
  });

  it('give the phone the salary the API (and Stripe) computes with the same version', async () => {
    const set = [change(WHEAT_COST, 4800)];
    const t = setup({ answer: published(1, set) });
    await t.s.start();
    const farm = { ...ME, demo_now: '2026-11-15T00:00:00Z' } as unknown as PlanFarm;
    const onPhone = computeFarmPlan(farm, t.s.getState().farm!.farmData).salary.salary;
    const onApi = computeFarmPlan(farm, applyOverrides(set)).salary.salary;
    expect(onPhone).toBe(onApi);
    expect(onPhone).toBeLessThan(computeFarmPlan(farm, data).salary.salary);
  });

  it('stay in force offline, from the copy on the phone', async () => {
    const t = setup({ online: false, saved: { [KEY]: copy(2, [change(WHEAT_COST, 4800)]) } });
    await t.s.start();
    expect(t.reads()).toBe(0);
    expect(t.cost()).toBe(4800);
    expect(t.s.getState().predictions.version).toBe(2);
  });

  it('without a copy and without internet, the figures are the files', async () => {
    const t = setup({ online: false });
    await t.s.start();
    expect(t.cost()).toBe(FILE_COST);
    expect(t.s.getState().predictions).toEqual({ version: 0, admin: false, overrides: [] });
  });

  it('a failed read keeps the copy', async () => {
    const t = setup({ fails: true, saved: { [KEY]: copy(2, [change(WHEAT_COST, 4800)]) } });
    await t.s.start();
    expect(t.cost()).toBe(4800);
    expect(t.s.getState().predictions.version).toBe(2);
  });

  it('works the plan out again only when the version changes', async () => {
    const t = setup({ answer: published(1, [change(WHEAT_COST, 4800)]) });
    await t.s.start();
    const v = t.s.getState().version;
    await t.s.refreshPredictions();
    expect(t.s.getState().version).toBe(v);
    t.setServer(published(2, []));
    await t.s.refreshPredictions();
    expect(t.s.getState().version).toBe(v + 1);
    expect(t.cost()).toBe(FILE_COST);
  });

  it('reads again when the internet comes back', async () => {
    const t = setup({ online: false });
    await t.s.start();
    t.setServer(published(1, [change(WHEAT_COST, 4800)]));
    t.setOnline(true);
    t.s.browserOnline();
    await vi.waitFor(() => expect(t.cost()).toBe(4800));
  });

  it('ignores an answer of the wrong shape', async () => {
    const t = setup({ answer: { version: 'x' }, saved: { [KEY]: copy(2, [change(WHEAT_COST, 4800)]) } });
    await t.s.start();
    expect(t.cost()).toBe(4800);
  });

  it('leaves out a change this build of the app does not know, and keeps the others', async () => {
    const t = setup({ answer: published(5, [change(WHEAT_COST, 4800), change('crops.crops[id=orz-nou].price_lei_per_kg.mean', 1)]) });
    await t.s.start();
    expect(t.cost()).toBe(4800);
  });

  it('a damaged copy on the phone counts as none', async () => {
    const t = setup({ online: false, saved: { [KEY]: '{"version":2' } });
    await t.s.start();
    expect(t.cost()).toBe(FILE_COST);
  });
});

describe("Ion's farm without an account", () => {
  it('never reads them and always shows the files, even with a copy on the phone', async () => {
    const t = setup({ mode: 'demo', answer: published(3, [change(WHEAT_COST, 4800)], true), saved: { [KEY]: copy(3, [change(WHEAT_COST, 4800)], true) } });
    await t.s.start();
    await t.s.refreshPredictions();
    await t.s.phoneBack();
    expect(t.reads()).toBe(0);
    expect(t.cost()).toBe(FILE_COST);
    expect(t.s.getState().predictions).toEqual({ version: 0, admin: false, overrides: [] });
  });
});
