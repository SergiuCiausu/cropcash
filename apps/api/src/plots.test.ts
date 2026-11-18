import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { findFunction, loadData, type WriteFunction } from '@cropcash/shared';
import { createApp } from './app';
import type { Repo } from './db/repo';
import { PlotsError, type PlotStore } from './db/plots';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const ID = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const OP = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';

function setup(store: Partial<PlotStore> = {}) {
  const plots: PlotStore = {
    list: vi.fn(async () => ({ plots: [], seasons: [], operations: [] })),
    save: vi.fn(async (_t: string, _y: number, rows: Record<string, unknown>[]) => rows.map((r, i) => (r.id as string) ?? `new-${i}`)),
    addOperation: vi.fn(async () => OP),
    updateOperation: vi.fn(async () => {}),
    removeOperation: vi.fn(async () => true),
    ...store,
  };
  const app = createApp({ corsOrigins: [], verifyToken, repo: {} as Repo, data, getRates: async () => null, plots });
  return { app, plots };
}

/** The request the phone's registry builds, sent as the phone sends it. */
function send(app: ReturnType<typeof setup>['app'], name: string, input: unknown, headers: Record<string, string> = {}) {
  const { method, path, body } = (findFunction(name) as WriteFunction).request(input as never);
  const r = request(app)[method.toLowerCase() as 'put' | 'post' | 'delete'](path).set(as('ion')).set(headers);
  return body === undefined ? r : r.send(body as object);
}

const paperRows = {
  harvestYear: 2027,
  plots: [
    { county: 'TR', siruta: 153277, blocFizic: '286', parcelNo: '1a', lpisFbid: '153277-286', landUse: 'TA', season: { cropId: 'grau', areaAri: 800 } },
    { id: ID, season: { cropId: 'porumb', apiaCropCode: 108, areaAri: 700 } },
  ],
};

describe('parcels API', () => {
  it('needs a session, and reads the year asked for', async () => {
    const { app, plots } = setup();
    expect((await request(app).get('/api/plots')).status).toBe(401);
    expect((await request(app).get('/api/plots?year=2027').set(as('ion'))).body).toEqual({ plots: [], seasons: [], operations: [] });
    expect(plots.list).toHaveBeenCalledWith('ion', 2027);
    await request(app).get('/api/plots').set(as('ion'));
    expect(plots.list).toHaveBeenLastCalledWith('ion', undefined);
    expect((await request(app).get('/api/plots?year=abc').set(as('ion'))).status).toBe(400);
  });

  it('saves the review sheet as snake_case rows and answers the ids', async () => {
    const { app, plots } = setup();
    const res = await send(app, 'save_plots', paperRows);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ids: ['new-0', ID] });
    expect(plots.save).toHaveBeenCalledWith('ion', 2027, [
      {
        county: 'TR',
        siruta: 153277,
        bloc_fizic: '286',
        parcel_no: '1a',
        lpis_fbid: '153277-286',
        land_use: 'TA',
        season: { crop_id: 'grau', apia_crop_code: null, area_ari: 800, sown_on: null, harvested_on: null, second_crop_id: null },
      },
      { id: ID, season: { crop_id: 'porumb', apia_crop_code: 108, area_ari: 700, sown_on: null, harvested_on: null, second_crop_id: null } },
    ]);
  });

  it('a repeated save with the same key gets the first answer and saves once', async () => {
    const { app, plots } = setup();
    const key = { 'Idempotency-Key': 'tap-1' };
    const [a, b] = await Promise.all([send(app, 'save_plots', paperRows, key), send(app, 'save_plots', paperRows, key)]);
    expect(b.body).toEqual(a.body);
    await send(app, 'save_plots', paperRows, key);
    expect(plots.save).toHaveBeenCalledTimes(1);
    // Another farmer's tap with the same key is a different save.
    await request(app).put('/api/plots').set(as('maria')).set(key).send(paperRows);
    expect(plots.save).toHaveBeenCalledTimes(2);
  });

  it("refuses bad input before the database, and passes the database's refusals on", async () => {
    const { app, plots } = setup({
      save: vi.fn(async () => {
        throw new PlotsError(409, 'below_mapped', 'crop grau is smaller than its parcels on the map');
      }),
    });
    expect((await request(app).put('/api/plots').set(as('ion')).send({ harvestYear: 2027, plots: [] })).status).toBe(400);
    expect((await request(app).put('/api/plots').set(as('ion')).send({ ...paperRows, farmer_id: ID })).status).toBe(400);
    expect(plots.save).not.toHaveBeenCalled();
    const refused = await send(app, 'save_plots', paperRows);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'below_mapped' });
  });

  it('changes one parcel with the id from the path', async () => {
    const { app, plots } = setup();
    const res = await send(app, 'update_plot', { id: ID, harvestYear: 2027, plot: { name: 'La pădure', season: null } });
    expect(res.status).toBe(200);
    expect(plots.save).toHaveBeenCalledWith('ion', 2027, [{ id: ID, name: 'La pădure', season: null }]);
    expect((await request(app).put('/api/plots/not-a-uuid').set(as('ion')).send({ harvestYear: 2027, plot: {} })).status).toBe(400);
  });

  it('adds, changes and removes an operation', async () => {
    const { app, plots } = setup({ removeOperation: vi.fn(async () => false) });
    const added = await send(app, 'add_operation', { plotId: ID, harvestYear: 2027, kind: 'fungicide', status: 'planned', clientId: OP });
    expect(added.status).toBe(201);
    expect(added.body).toEqual({ id: OP });
    expect(plots.addOperation).toHaveBeenCalledWith('ion', { plot_id: ID, harvest_year: 2027, client_id: OP, kind: 'fungicide', status: 'planned' });

    expect((await send(app, 'update_operation', { id: OP, status: 'done', onDate: '2026-11-14' })).status).toBe(200);
    expect(plots.updateOperation).toHaveBeenCalledWith('ion', OP, { status: 'done', on_date: '2026-11-14' });
    expect((await request(app).put(`/api/plots/operations/${OP}`).set(as('ion')).send({})).status).toBe(400);

    // Already gone: 404, which the phone's remove_operation takes as done.
    expect((await send(app, 'remove_operation', { id: OP })).status).toBe(404);
    expect(findFunction('remove_operation')).toMatchObject({ repeatSafe: 'gone' });
  });

  it("an operation on a parcel that isn't the farmer's is not found", async () => {
    const { app } = setup({
      addOperation: vi.fn(async () => {
        throw new PlotsError(404, 'not_found', 'unknown parcel');
      }),
    });
    const res = await send(app, 'add_operation', { plotId: ID, harvestYear: 2027, kind: 'harvest', status: 'done', onDate: '2026-08-01' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('keeps the parcel writes away from the assistant', () => {
    for (const name of ['save_plots', 'update_plot', 'add_operation', 'update_operation', 'remove_operation']) {
      expect(findFunction(name)?.access).toBe('user');
    }
  });
});
