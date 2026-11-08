import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { memoryStore, type Mode } from './storage';
import { createStore, type LiveCalls } from './store';

const NOW = new Date('2026-11-15T10:00:00Z');
const SESSION = { 'sb-test-auth-token': '{}' };
const ME = {
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, planted_month: '2026-10' },
    { crop_id: 'porumb', area_ari: 700 },
  ],
  transactions: [],
  task_completions: [],
  pension_plans: [],
  opportunity_follows: [],
};
const data = loadData();

function setup({ mode = 'farm' as Mode, saved = {} as Record<string, string>, online = true, farmer = ME as unknown, write = (async () => ({})) as (name: string, input: unknown) => Promise<unknown>, shared = undefined as ReturnType<typeof memoryStore> | undefined, meFails = (() => false) as () => boolean, refreshSession = undefined as (() => Promise<boolean>) | undefined } = {}) {
  const store = shared ?? memoryStore(saved);
  let net = online;
  let server = farmer;
  const calls: { kind: string; name: string; input?: unknown; options?: unknown }[] = [];
  const live: LiveCalls = {
    ...(refreshSession ? { refreshSession } : {}),
    api: vi.fn(async (path: string) => {
      calls.push({ kind: 'api', name: path });
      if (path === '/api/me') {
        if (meFails()) throw Object.assign(new Error('no answer'), { status: 0, code: 'network' });
        return { farmer: server } as never;
      }
      return {} as never;
    }),
    read: vi.fn(async (name: string) => {
      calls.push({ kind: 'read', name });
      return { data: name === 'search_opportunities' ? [] : [] } as never;
    }),
    write: vi.fn(async (name: string, input: unknown, options?: unknown) => {
      calls.push({ kind: 'write', name, input, ...(options && Object.keys(options).length ? { options } : {}) });
      return write(name, input) as never;
    }),
  };
  let id = 0;
  const s = createStore({
    mode,
    store,
    data,
    live,
    now: () => NOW,
    randomId: () => `id-${++id}`,
    net: {
      apiUrl: 'http://api.test',
      browserOnline: () => net,
      fetchFn: (async () => ({ ok: net })) as unknown as typeof fetch,
      setTimer: () => 0,
      clearTimer: () => undefined,
    },
  });
  return {
    s,
    store,
    calls,
    live,
    setOnline: (v: boolean) => (net = v),
    setServer: (f: unknown) => (server = f),
    json: (k: string) => JSON.parse(store.getItem(k) ?? 'null'),
  };
}

const signedIn = (extra: Record<string, string> = {}) => ({ ...SESSION, 'cropcash-me': JSON.stringify(ME), ...extra });

describe('start', () => {
  it('is not ready before it reads storage', () => {
    const { s } = setup({ mode: 'demo' });
    expect(s.getState().ready).toBe(false);
    expect(s.getState().farm).toBeNull();
  });

  it('opens Ion in the demo without calling the server, even when signed in', async () => {
    const { s, calls } = setup({ mode: 'demo', saved: signedIn() });
    await s.start();
    const { farm } = s.getState();
    expect(farm?.isIon).toBe(true);
    expect(farm?.me).toBeNull();
    expect(farm?.baseFarm?.name).toBe('Ion');
    expect(calls).toEqual([]);
  });

  it('has no farm in farm mode without a copy, so the guard can send the farmer on', async () => {
    const { s } = setup({ saved: { ...SESSION } , farmer: null });
    await s.start();
    expect(s.getState().farm?.baseFarm).toBeNull();
    expect(s.getState().farm?.signedIn).toBe(true);
  });

  it('opens from the copy and keeps it when the server says the same', async () => {
    const { s } = setup({ saved: signedIn() });
    await s.start();
    expect(s.getState().farm?.me?.name).toBe('Ion');
    expect(s.getState().version).toBe(1);
  });

  it('reads storage again when the server copy changed, with no page reload', async () => {
    const { s } = setup({ saved: signedIn(), farmer: { ...ME, start_balance_bani: 4_000_000 } });
    const seen: number[] = [];
    s.subscribe(() => seen.push(s.getState().version));
    await s.start();
    expect(s.getState().farm?.baseFarm?.startBalanceBani).toBe(4_000_000);
    expect(seen.at(-1)).toBe(2);
  });

  it('moves the date when only the demo clock changed', async () => {
    const { s } = setup({ saved: signedIn(), farmer: { ...ME, demo_now: '2027-04-15T00:00:00Z' } });
    await s.start();
    expect(s.getState().farm?.today).toBe('2027-04-15');
  });

  it('signs out on a 401 and keeps nothing of the farm copy', async () => {
    const { s, store, live } = setup({ saved: signedIn() });
    (live.api as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('401'), { status: 401 }));
    await s.start();
    expect(store.getItem('cropcash-me')).toBeNull();
    expect(store.getItem('sb-test-auth-token')).toBeNull();
    expect(s.getState().farm?.signedIn).toBe(false);
    expect(s.getState().farm?.baseFarm).toBeNull();
  });

  it('keeps the copy offline', async () => {
    const { s } = setup({ saved: signedIn(), online: false });
    await s.start();
    expect(s.getState().farm?.me?.name).toBe('Ion');
    expect(s.getState().online).toBe(false);
  });
});

describe('send', () => {
  it('writes with a client id, then saves the new copy and reads it', async () => {
    const after = { ...ME, transactions: [{ id: 't9', kind: 'expense', category: 'motorina', crop_id: 'grau', amount_bani: -30_000, occurred_at: '2026-11-15T12:00:00Z', source: 'manual' }] };
    const { s, calls, setServer } = setup({ saved: signedIn() });
    await s.start();
    setServer(after);
    await s.send(({ write }) => write('add_expense', { date: '2026-11-15', amountLei: 300, category: 'motorina', cropId: 'grau' }));
    expect(calls.find((c) => c.kind === 'write')?.input).toMatchObject({ clientId: 'id-1', amountLei: 300 });
    expect(s.getState().farm?.me?.transactions).toHaveLength(1);
  });

  it('queues a sale offline, and every figure already counts it', async () => {
    const { s, json } = setup({ saved: signedIn(), online: false });
    await s.start();
    await s.send(({ write }) => write('add_expense', { date: '2026-11-15', amountLei: 300, category: 'motorina', cropId: 'grau' }));
    expect(json('cropcash-outbox')).toHaveLength(1);
    expect(s.getState().farm?.outbox).toHaveLength(1);
    expect(s.getState().farm?.me?.transactions?.[0]).toMatchObject({ amount_bani: -30_000, pending: true });
  });

  it('never queues what moves money', async () => {
    const { s, json } = setup({ saved: signedIn(), online: false });
    await s.start();
    await expect(s.send(({ write }) => write('start_pension', { monthlyLei: 200 }))).rejects.toMatchObject({ code: 'offline' });
    expect(json('cropcash-outbox')).toBeNull();
  });

  it('queues a sale when the network drops mid-write', async () => {
    const { s, json } = setup({ saved: signedIn(), write: async () => Promise.reject(Object.assign(new Error('x'), { code: 'network' })) });
    await s.start();
    await s.send(({ write }) => write('record_sale', { date: '2026-11-15', cropId: 'grau', totalLei: 1000 }));
    expect(json('cropcash-outbox')).toHaveLength(1);
  });

  it('takes back a queued record on the phone', async () => {
    const { s, json } = setup({ saved: signedIn(), online: false });
    await s.start();
    await s.send(({ write }) => write('add_expense', { date: '2026-11-15', amountLei: 300, category: 'motorina' }));
    const id = json('cropcash-outbox')[0].id;
    await s.send(({ write }) => write('undo_transaction', { id }));
    expect(json('cropcash-outbox')).toEqual([]);
  });

  it('refuses in the demo: nothing reaches the server', async () => {
    const { s, calls } = setup({ mode: 'demo' });
    await s.start();
    await expect(s.send(({ write }) => write('add_expense', {}))).rejects.toMatchObject({ code: 'demo' });
    expect(calls).toEqual([]);
  });
});

describe('the outbox', () => {
  const queued = (n: number) =>
    JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `outbox:${i}-x`, name: 'add_expense', input: { date: '2026-11-15', amountLei: 100 + i, category: 'motorina' }, at: NOW.toISOString() })));

  it('two tabs flushing at once send each record once (IDEM-08)', async () => {
    const first = setup({ saved: signedIn({ 'cropcash-outbox': queued(2) }) });
    const second = setup({ shared: first.store });
    await Promise.all([first.s.flushOutbox(), second.s.flushOutbox()]);
    const sent = [...first.calls, ...second.calls].filter((c) => c.kind === 'write');
    expect(sent).toHaveLength(2);
    expect(first.json('cropcash-outbox')).toEqual([]);
  });

  it('gives an old queued record an id and saves it before sending', async () => {
    let savedAtSend: { input: { clientId?: string } }[] = [];
    const t = setup({ saved: signedIn({ 'cropcash-outbox': queued(1) }), write: async () => {
      savedAtSend = t.json('cropcash-outbox');
      return { id: 'srv-1' };
    } });
    await t.s.flushOutbox();
    expect(savedAtSend[0]?.input.clientId).toBe('id-1');
    expect(t.calls.find((c) => c.kind === 'write')?.input).toMatchObject({ clientId: 'id-1' });
  });

  it('a record another tab already sent is taken back from the server', async () => {
    const t = setup({ saved: signedIn({ 'cropcash-outbox': queued(1) }), write: async (name) => (name === 'add_expense' ? { id: 'srv-1' } : {}) });
    await t.s.flushOutbox();
    expect(t.json('cropcash-outbox-sent')['outbox:0-x'].serverId).toBe('srv-1');
    await t.s.send(({ write }) => write('undo_transaction', { id: 'outbox:0-x' }));
    expect(t.calls.filter((c) => c.name === 'undo_transaction').map((c) => c.input)).toEqual([{ id: 'srv-1' }]);
  });

  it('sends in order on start and empties', async () => {
    const { s, calls, json } = setup({ saved: signedIn({ 'cropcash-outbox': queued(2) }) });
    await s.start();
    expect(calls.filter((c) => c.kind === 'write').map((c) => (c.input as { amountLei: number }).amountLei)).toEqual([100, 101]);
    expect(json('cropcash-outbox')).toEqual([]);
    expect(s.getState().farm?.outbox).toEqual([]);
  });

  it('keeps a refused record aside and goes on', async () => {
    let n = 0;
    const { s, json } = setup({ saved: signedIn({ 'cropcash-outbox': queued(2) }), write: async () => (n++ === 0 ? Promise.reject(Object.assign(new Error('bad'), { status: 400 })) : {}) });
    await s.start();
    expect(json('cropcash-outbox')).toEqual([]);
    expect(json('cropcash-outbox-refused')).toHaveLength(1);
    expect(s.getState().farm?.refused).toHaveLength(1);
    s.dismissRefused();
    expect(s.getState().farm?.refused).toEqual([]);
  });

  it('sets aside an item this version rejects on the phone, and sends the next one', async () => {
    let n = 0;
    /* createFunctions throws ApiError(0, 'invalid_input') before any request: status 0, every time. */
    const { s, calls, json } = setup({ saved: signedIn({ 'cropcash-outbox': queued(2) }), write: async () => (n++ === 0 ? Promise.reject(Object.assign(new Error('bad'), { status: 0, code: 'invalid_input' })) : {}) });
    await s.start();
    expect(calls.filter((c) => c.kind === 'write')).toHaveLength(2);
    expect(json('cropcash-outbox')).toEqual([]);
    expect(json('cropcash-outbox-refused').map((i: { input: { amountLei: number } }) => i.input.amountLei)).toEqual([100]);
  });

  it('stops at a server error and keeps the rest for later', async () => {
    const { s, json } = setup({ saved: signedIn({ 'cropcash-outbox': queued(2) }), write: async () => Promise.reject(Object.assign(new Error('down'), { status: 503 })) });
    await s.start();
    expect(json('cropcash-outbox')).toHaveLength(2);
  });

  it('sends when the internet comes back', async () => {
    const { s, setOnline, json } = setup({ saved: signedIn({ 'cropcash-outbox': queued(1) }), online: false });
    await s.start();
    expect(json('cropcash-outbox')).toHaveLength(1);
    setOnline(true);
    await s.browserOnline();
    await vi.waitFor(() => expect(json('cropcash-outbox')).toEqual([]));
    expect(s.getState().online).toBe(true);
  });
});

describe('harvests', () => {
  it('sends the version it saw, so a stale phone cannot overwrite (IDEM-12)', async () => {
    const { s, calls } = setup({ saved: { ...SESSION, 'cropcash-me': JSON.stringify({ ...ME, harvests_version: 4 }) }, farmer: { ...ME, harvests_version: 4 } });
    await s.start();
    await s.updateHarvests(() => undefined);
    expect(calls.find((c) => c.name === 'save_harvests')?.options).toEqual({ version: 4 });
  });

  it('brings in the other phone\'s figures when it saved first, and says so', async () => {
    const conflict = Object.assign(new Error('409'), { status: 409, code: 'changed_elsewhere' });
    const t = setup({
      saved: { ...SESSION, 'cropcash-me': JSON.stringify({ ...ME, harvests_version: 4 }) },
      farmer: { ...ME, harvests_version: 4 },
      write: async (name) => (name === 'save_harvests' ? Promise.reject(conflict) : {}),
    });
    await t.s.start();
    t.setServer({ ...ME, harvests_version: 5 });
    await expect(t.s.updateHarvests(() => undefined)).rejects.toMatchObject({ code: 'changed_elsewhere' });
    expect(t.json('cropcash-me').harvests_version).toBe(5);
    expect(t.calls.some((c) => c.name === 'update_farm')).toBe(false);
  });

  it('saves the pick only, for a signed-in farm', async () => {
    const { s, json } = setup({ saved: signedIn() });
    await s.start();
    s.selectHarvest('r2027', 'grau');
    expect(json('cropcash-harvests')).toEqual({ selected: 'r2027', crop: 'grau' });
    expect(s.getState().farm?.harvests?.crop).toBe('grau');
  });

  it("keeps all of Ion's harvests on the phone, under the demo keys", async () => {
    const { s, json, store } = setup({ mode: 'demo' });
    await s.start();
    await s.updateHarvests((h) => {
      h.items[0].records.push({ id: 'r1', date: '2026-11-10', kind: 'expense', amountBani: -45_000, cropId: 'grau' });
    });
    expect(json('cropcash-demo-harvests').items[0].records).toHaveLength(1);
    expect(store.getItem('cropcash-harvests')).toBeNull();
    expect(s.getState().farm?.harvests?.items[0].records).toHaveLength(1);
  });

  it('sends a signed-in farm its harvests, and the farm change when the year under way changed', async () => {
    const { s, calls } = setup({ saved: signedIn() });
    await s.start();
    await s.updateHarvests((h) => {
      h.items.find((x) => x.year === 2027)!.openingBani = 4_000_000;
    });
    expect(calls.filter((c) => c.kind === 'write').map((c) => c.name)).toEqual(['save_harvests', 'update_farm']);
  });

  it("saves Ion's plan figures and pension in the demo", async () => {
    const { s, store } = setup({ mode: 'demo' });
    await s.start();
    await s.savePlanFigures({ openingBani: 2_000_000, expected: [], pension: 15_000 });
    expect(store.getItem('cropcash-demo-pension')).toBe('15000');
    expect(s.getState().farm?.ownPension).toBe(15_000);
    expect(s.getState().farm?.harvests?.items[0].openingBani).toBe(2_000_000);
  });
});

describe('tasks, follows and currency', () => {
  it('ticks a task on the phone in the demo', async () => {
    const { s, store } = setup({ mode: 'demo' });
    await s.start();
    await s.setTaskDone('apia:2027', true);
    expect(JSON.parse(store.getItem('cropcash-demo-done')!)).toEqual(['apia:2027']);
    await s.setTaskDone('apia:2027', false);
    expect(s.getState().farm?.doneTasks).toEqual([]);
  });

  it('ticks a task on the server for a signed-in farm', async () => {
    const { s, calls } = setup({ saved: signedIn() });
    await s.start();
    await s.setTaskDone('apia:2027', true);
    expect(calls.filter((c) => c.kind === 'write')).toEqual([{ kind: 'write', name: 'complete_task', input: { id: 'apia:2027' } }]);
  });

  it('follows calls on the phone in the demo, and on the server signed in', async () => {
    const demo = setup({ mode: 'demo' });
    await demo.s.start();
    await demo.s.setFollow(['a', 'b'], true);
    expect(demo.s.getState().farm?.follows).toEqual(['a', 'b']);
    const farm = setup({ saved: signedIn() });
    await farm.s.start();
    await farm.s.setFollow(['a'], true);
    expect(farm.calls.filter((c) => c.kind === 'write').map((c) => c.name)).toEqual(['follow_opportunity']);
  });

  it('keeps the currency in lei until there are rates', async () => {
    const { s } = setup({ mode: 'demo' });
    await s.start();
    s.setCurrency('EUR');
    expect(s.getState().farm?.currency.code).toBe('RON');
    s.setRates({ date: '2026-11-07', rates: { RON: 5, USD: 1.1, GBP: 0.85 } });
    expect(s.getState().farm?.currency.code).toBe('EUR');
  });
});

describe('the monitor', () => {
  it('reads the calls on the pages that show them, at most once an hour', async () => {
    const { s, calls, json } = setup({ saved: signedIn() });
    await s.start();
    await s.refreshMonitor();
    expect(calls.filter((c) => c.kind === 'read').map((c) => c.name).sort()).toEqual(['list_opportunity_changes', 'list_recent_changes', 'list_sources', 'search_opportunities']);
    expect(json('cropcash-monitor').savedAt).toBe(NOW.toISOString());
    const before = calls.length;
    await s.refreshMonitor();
    expect(calls.length).toBe(before);
  });

  it('shows the snapshot in the demo and never reads', async () => {
    const { s, calls } = setup({ mode: 'demo' });
    await s.start();
    await s.refreshMonitor();
    expect(calls).toEqual([]);
    expect(s.getState().monitor.fromServer).toBe(false);
  });
});


describe('when the network or the server misbehaves (docs/failure-handling-plan.md)', () => {
  const fail = (status: number, code: string, retryAfterMs: number | null = null) => Object.assign(new Error(code), { status, code, retryAfterMs });
  const sale = { cropId: 'grau', date: '2026-11-15', totalLei: 100 };
  const waiting = (over: Record<string, unknown> = {}) => JSON.stringify([{ id: 'outbox:1', name: 'record_sale', input: { ...sale, clientId: 'c1' }, at: '2026-11-15T10:00:00Z', ...over }]);

  it('does not call a save failed when only fetching the new figures failed (FAIL-02)', async () => {
    let down = false;
    const t = setup({ saved: signedIn({ 'cropcash-me-at': '2026-11-14T10:00:00Z' }), meFails: () => down });
    await t.s.start();
    down = true;
    await expect(t.s.send(({ write }) => write('record_sale', sale))).resolves.toBeUndefined();
    expect(t.store.getItem('cropcash-me-at')).toBeNull();
  });

  it('renews an expired session and sends once more (FAIL-11)', async () => {
    let n = 0;
    const t = setup({ saved: signedIn(), refreshSession: async () => true, write: async () => (n++ === 0 ? Promise.reject(fail(401, 'unauthorized')) : { id: 'x' }) });
    await t.s.start();
    await t.s.send(({ write }) => write('follow_opportunity', { key: 'a' }));
    expect(t.calls.filter((c) => c.kind === 'write')).toHaveLength(2);
  });

  it('says so when the session cannot be renewed, and keeps the farm (FAIL-11)', async () => {
    const t = setup({ saved: signedIn(), refreshSession: async () => false, write: async () => Promise.reject(fail(401, 'unauthorized')) });
    await t.s.start();
    await expect(t.s.send(({ write }) => write('follow_opportunity', { key: 'a' }))).rejects.toMatchObject({ status: 401 });
    expect(t.json('cropcash-me')).not.toBeNull();
  });

  it('queues a record whose answer never came, and a plan save only when it never left (FAIL-01, FAIL-14)', async () => {
    const t = setup({ saved: signedIn(), write: async () => Promise.reject(fail(0, 'timeout')) });
    await t.s.start();
    await t.s.send(({ write }) => write('record_sale', sale));
    expect(t.json('cropcash-outbox')).toHaveLength(1);
    await expect(t.s.updateHarvests(() => undefined)).rejects.toMatchObject({ code: 'timeout' });
    expect(t.json('cropcash-outbox')).toHaveLength(1);
  });

  describe('a money move with no answer (FAIL-03)', () => {
    const lost = async () => Promise.reject(fail(0, 'timeout'));
    const pension = { status: 'active', monthly_bani: 30_000 };

    it('counts as done when the farm shows it', async () => {
      const t = setup({ saved: signedIn(), farmer: { ...ME, pension_plans: [pension] }, write: lost });
      await t.s.start();
      await expect(t.s.send(({ write }) => write('start_pension', { monthlyLei: 300 }))).resolves.toBeUndefined();
    });

    it('says nothing moved when the farm shows it did not', async () => {
      const t = setup({ saved: signedIn(), write: lost });
      await t.s.start();
      await expect(t.s.send(({ write }) => write('start_pension', { monthlyLei: 300 }))).rejects.toMatchObject({ code: 'money_not_done', moneyMove: true });
    });

    it('says we do not know when the farm cannot be read either', async () => {
      let down = false;
      const t = setup({ saved: signedIn(), write: lost, meFails: () => down });
      await t.s.start();
      down = true;
      await expect(t.s.send(({ write }) => write('start_pension', { monthlyLei: 300 }))).rejects.toMatchObject({ code: 'timeout', moneyMove: true, unknownOutcome: true });
    });

    it('leaves a clear refusal alone', async () => {
      const t = setup({ saved: signedIn(), write: async () => Promise.reject(fail(409, 'busy')) });
      await t.s.start();
      await expect(t.s.send(({ write }) => write('start_pension', { monthlyLei: 300 }))).rejects.toMatchObject({ code: 'busy', moneyMove: true });
      expect(t.calls.filter((c) => c.name === '/api/me')).toHaveLength(1);
    });
  });

  describe('the queue (FAIL-05)', () => {
    it('keeps a record the server is too busy for and notes when to try again', async () => {
      const t = setup({ saved: signedIn({ 'cropcash-outbox': waiting() }), write: async () => Promise.reject(fail(429, 'rate_limited', 300_000)) });
      await t.s.start();
      const [item] = t.json('cropcash-outbox');
      expect(item).toMatchObject({ attempts: 1, nextAt: NOW.getTime() + 300_000, lastError: 'rate_limited' });
      expect(t.json('cropcash-outbox-refused')).toBeNull();
      t.s.stop();
    });

    it('does not try before that time', async () => {
      const t = setup({ saved: signedIn({ 'cropcash-outbox': waiting({ attempts: 1, nextAt: NOW.getTime() + 60_000 }) }) });
      await t.s.start();
      expect(t.calls.filter((c) => c.kind === 'write')).toEqual([]);
      t.s.stop();
    });

    it('keeps the queue when signed out, without counting a failed try', async () => {
      const t = setup({ saved: signedIn({ 'cropcash-outbox': waiting() }), refreshSession: async () => false, write: async () => Promise.reject(fail(401, 'unauthorized')) });
      await t.s.start();
      expect(t.json('cropcash-outbox')[0].attempts).toBeUndefined();
      expect(t.json('cropcash-outbox-refused')).toBeNull();
    });

    it('sends what waited offline as one plan save, on the version the phone had (FAIL-14)', async () => {
      const copy = { ...ME, harvests_version: 4 };
      const t = setup({ saved: { ...SESSION, 'cropcash-me': JSON.stringify(copy) }, farmer: copy, online: false });
      await t.s.start();
      await t.s.updateHarvests(() => undefined);
      await t.s.updateHarvests(() => undefined);
      expect(t.json('cropcash-outbox').filter((i: { name: string }) => i.name === 'save_harvests')).toHaveLength(1);
      t.setOnline(true);
      await t.s.browserOnline();
      await vi.waitFor(() => expect(t.json('cropcash-outbox')).toEqual([]));
      const sent = t.calls.filter((c) => c.name === 'save_harvests');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.options).toEqual({ version: 4 });
    });

    const planSave = (input: Record<string, unknown>) => JSON.stringify([{ id: 'outbox:2', name: 'save_harvests', input, version: 1, at: '2026-11-15T10:00:00Z' }]);
    const doc = { years: [], gathered: [], expected: [], ownCrops: [], closed: [] };
    const conflict = async () => Promise.reject(fail(409, 'changed_elsewhere'));

    it('counts a plan save as sent when the server already has exactly that plan', async () => {
      const t = setup({ saved: signedIn({ 'cropcash-outbox': planSave(doc) }), farmer: { ...ME, harvests: { ...doc } }, write: conflict });
      await t.s.start();
      expect(t.json('cropcash-outbox')).toEqual([]);
      expect(t.json('cropcash-outbox-refused')).toBeNull();
    });

    it('sets a plan save aside when another phone really changed the plan', async () => {
      const t = setup({ saved: signedIn({ 'cropcash-outbox': planSave(doc) }), farmer: { ...ME, harvests: { ...doc, gathered: [{ cropId: 'grau' }] } }, write: conflict });
      await t.s.start();
      expect(t.json('cropcash-outbox')).toEqual([]);
      expect(t.json('cropcash-outbox-refused')).toHaveLength(1);
    });
  });
});
