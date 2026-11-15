import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData, type Override } from '@cropcash/shared';
import { createApp } from './app';
import type { FarmRow, Repo } from './db/repo';
import { StaleVersion, type PredictionStore, type PublishedVersion } from './db/predictions';
import { createDataSource, liveData } from './predictions/source';

/* The admin panel's API (docs/admin-panel-plan.md step 4), on an in-memory store like migration 025. */

function memoryStore() {
  const versions: PublishedVersion[] = [];
  const store: PredictionStore = {
    current: vi.fn(async () => {
      const top = versions.at(-1);
      return { version: top?.version ?? 0, overrides: top?.overrides ?? [] };
    }),
    version: async (n) => versions.find((v) => v.version === n) ?? null,
    history: async (limit) => [...versions].reverse().slice(0, limit).map(({ overrides, ...v }) => ({ ...v, changes: overrides.length })),
    publish: vi.fn(async ({ baseVersion, note, overrides, by, revertedFrom = null }) => {
      const current = versions.at(-1)?.version ?? 0;
      if (baseVersion !== current) throw new StaleVersion(`edited ${baseVersion}, current ${current}`);
      const paths = overrides.map((o: Override) => o.path);
      if (new Set(paths).size !== paths.length) throw new Error('duplicate key');
      versions.push({ version: current + 1, publishedAt: '2026-11-14T10:00:00Z', publishedBy: by, note, revertedFrom, overrides: [...overrides] });
      return current + 1;
    }),
  };
  return { store, versions };
}

const ion: FarmRow = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: '2026-11-15T00:00:00Z',
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
} as FarmRow;

const verifyToken = async (token: string) =>
  token === 'admin' ? { userId: 'u-admin', email: 'Ion@CropCash.test' } : { userId: 'u-farmer', email: 'vasile@example.com' };
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const { store, versions } = memoryStore();
  const source = createDataSource({ store, log: () => {} });
  await source.refresh();
  const app = createApp({
    corsOrigins: [],
    verifyToken,
    repo: { getMyFarm: async () => ion } as unknown as Repo,
    data: liveData(source),
    now: () => new Date('2026-11-15T10:00:00Z'),
    getRates: async () => null,
    predictions: { store, source, admins: ['ion@cropcash.test'] },
  });
  return { app, store, source, versions };
}

const WHEAT_COST = 'crops.crops[id=grau].cost_lei_per_ha.mean';
const change = (path: string, value: Override['value'], reason = 'Agro-Info, nov. 2026'): Override => ({ path, value, reason });
const salary = async (app: Awaited<ReturnType<typeof setup>>['app']) =>
  (await request(app).post('/api/functions/get_plan').set(as('farmer')).send({})).body.data.salary.salary as number;

describe('who may do what', () => {
  it('needs a session for everything', async () => {
    const { app } = await setup();
    for (const path of ['/api/prediction-data', '/api/admin/factors', '/api/admin/versions'])
      expect((await request(app).get(path)).status).toBe(401);
  });

  it('a farmer reads the published changes but never the panel', async () => {
    const { app, store } = await setup();
    const data = await request(app).get('/api/prediction-data').set(as('farmer'));
    expect(data.body).toEqual({ version: 0, overrides: [], admin: false });
    expect((await request(app).get('/api/admin/factors').set(as('farmer'))).status).toBe(403);
    expect((await request(app).get('/api/admin/versions').set(as('farmer'))).status).toBe(403);
    const publish = await request(app).post('/api/admin/publish').set(as('farmer')).send({ baseVersion: 0, note: 'eu', overrides: [] });
    expect(publish.status).toBe(403);
    expect((await request(app).post('/api/admin/revert/1').set(as('farmer')).send({ baseVersion: 0 })).status).toBe(403);
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('the admin is told so, whatever the case of the email', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/prediction-data').set(as('admin'))).body.admin).toBe(true);
  });
});

describe('GET /api/prediction-data', () => {
  it('answers 304 while the version is the same', async () => {
    const { app } = await setup();
    const first = await request(app).get('/api/prediction-data').set(as('farmer'));
    const again = await request(app).get('/api/prediction-data').set(as('farmer')).set('If-None-Match', first.headers.etag!);
    expect(again.status).toBe(304);
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'cost', overrides: [change(WHEAT_COST, 4800)] });
    const changed = await request(app).get('/api/prediction-data').set(as('farmer')).set('If-None-Match', first.headers.etag!);
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ version: 1, overrides: [change(WHEAT_COST, 4800)], admin: false });
  });
});

describe('GET /api/admin/factors', () => {
  it('lists every editable figure with the file value, the value in force and why', async () => {
    const { app } = await setup();
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'cost', overrides: [change(WHEAT_COST, 4800)] });
    const res = await request(app).get('/api/admin/factors').set(as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.groups.crops).toBe('Culturi');
    const fileCost = loadData().crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean;
    expect(res.body.factors.find((f: { path: string }) => f.path === WHEAT_COST)).toMatchObject({
      group: 'crops',
      type: 'number',
      unit: 'lei/ha',
      fileValue: fileCost,
      value: 4800,
      reason: 'Agro-Info, nov. 2026',
    });
    const price = res.body.factors.find((f: { path: string }) => f.path === 'crops.crops[id=grau].price_lei_per_kg.mean');
    expect(price.reason).toBeNull();
    expect(price.value).toBe(price.fileValue);
    expect(res.body.factors.every((f: object) => !('pattern' in f))).toBe(true);
  });
});

describe('POST /api/admin/publish', () => {
  it('changes the salary the API computes, at once', async () => {
    const { app } = await setup();
    const before = await salary(app);
    const res = await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'cost mai mare', overrides: [change(WHEAT_COST, 4800)] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ version: 1 });
    expect(await salary(app)).toBeLessThan(before);
    // Back to the files: an empty set.
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 1, note: 'înapoi la fișier', overrides: [] });
    expect(await salary(app)).toBe(before);
  });

  it('refuses a change that does not check, and publishes nothing', async () => {
    const { app, store } = await setup();
    const res = await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'x', overrides: [change(WHEAT_COST, 4800), change('crops.crops[id=grau].name_ro', 'Orz')] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_override', code: 'not_editable', path: 'crops.crops[id=grau].name_ro' });
    const order = await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'x', overrides: [change('crops.crops[id=grau].price_lei_per_kg.mean', 9)] });
    expect(order.body).toMatchObject({ code: 'check_failed' });
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('refuses a body without a note or a reason', async () => {
    const { app } = await setup();
    expect((await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: ' ', overrides: [] })).status).toBe(400);
    expect((await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'x', overrides: [change(WHEAT_COST, 4800, '')] })).status).toBe(400);
  });

  it('answers 409 when someone published since, and says when it was the same set (a retried tap)', async () => {
    const { app } = await setup();
    const body = { baseVersion: 0, note: 'cost', overrides: [change(WHEAT_COST, 4800)] };
    await request(app).post('/api/admin/publish').set(as('admin')).send(body);
    const retry = await request(app).post('/api/admin/publish').set(as('admin')).send(body);
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual({ error: 'stale_version', current: 1, sameAsYours: true });
    const clash = await request(app).post('/api/admin/publish').set(as('admin')).send({ ...body, overrides: [change(WHEAT_COST, 5000)] });
    expect(clash.body).toEqual({ error: 'stale_version', current: 1, sameAsYours: false });
  });

  it('stores one spelling of each path', async () => {
    const { app, versions } = await setup();
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'x', overrides: [change(WHEAT_COST, 4800)] });
    expect(versions[0]!.overrides[0]!.path).toBe(WHEAT_COST);
  });
});

describe('versions and going back', () => {
  it('lists the versions and puts an old one back as a new version', async () => {
    const { app, versions } = await setup();
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 0, note: 'întâi', overrides: [change(WHEAT_COST, 4800)] });
    await request(app).post('/api/admin/publish').set(as('admin')).send({ baseVersion: 1, note: 'apoi', overrides: [] });
    const list = await request(app).get('/api/admin/versions').set(as('admin'));
    expect(list.body.current).toBe(2);
    expect(list.body.versions.map((v: { version: number; changes: number }) => [v.version, v.changes])).toEqual([[2, 0], [1, 1]]);
    expect((await request(app).get('/api/admin/versions/1').set(as('admin'))).body.overrides).toEqual([change(WHEAT_COST, 4800)]);
    expect((await request(app).get('/api/admin/versions/9').set(as('admin'))).status).toBe(404);

    const back = await request(app).post('/api/admin/revert/1').set(as('admin')).send({ baseVersion: 2 });
    expect(back.status).toBe(201);
    expect(versions.at(-1)).toMatchObject({ version: 3, revertedFrom: 1, note: 'Înapoi la versiunea 1', overrides: [change(WHEAT_COST, 4800)] });
    expect((await request(app).get('/api/prediction-data').set(as('farmer'))).body.version).toBe(3);
    expect((await request(app).post('/api/admin/revert/9').set(as('admin')).send({ baseVersion: 3 })).status).toBe(404);
  });
});

describe('the data source', () => {
  it('keeps the last good version when Supabase is down, and leaves out changes that no longer apply', async () => {
    const log = vi.fn();
    let fail = false;
    const stale = change('crops.crops[id=orz-vechi].price_lei_per_kg.mean', 1);
    const store = {
      current: async () => {
        if (fail) throw new Error('offline');
        return { version: 4, overrides: [change(WHEAT_COST, 4800), stale] };
      },
    };
    const source = createDataSource({ store, log });
    await source.refresh();
    expect(source.version()).toBe(4);
    expect(source.overrides()).toEqual([change(WHEAT_COST, 4800)]);
    expect(source.rejected()).toEqual([expect.objectContaining({ path: stale.path, code: 'unknown_path' })]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('left out'));
    fail = true;
    await source.refresh();
    expect(source.version()).toBe(4);
    expect(source.current().crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean).toBe(4800);
  });

  it('liveData reads, spreads and enumerates like the data in force', async () => {
    let version = 0;
    const store = { current: async () => ({ version, overrides: version ? [change(WHEAT_COST, 4800)] : [] }) };
    const source = createDataSource({ store, log: () => {} });
    const data = liveData(source);
    const cost = (d: typeof data) => d.crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean;
    expect(cost(data)).toBe(loadData().crops.crops.find((c) => c.id === 'grau')!.cost_lei_per_ha.mean);
    version = 1;
    await source.refresh();
    expect(cost(data)).toBe(4800);
    expect(cost({ ...data })).toBe(4800);
    expect(Object.keys(data).sort()).toEqual(Object.keys(loadData()).sort());
    expect('params' in data).toBe(true);
  });
});
