import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import type { Repo } from './db/repo';
import { ExciseRefused, type ExciseStore } from './db/excise';

const data = loadData();
const verifyToken = async () => ({ userId: 'u1', email: 'ion@example.com' });
const auth = { Authorization: 'Bearer t' };
const row = { schemeId: 'motorina-hg1174', year: 2026, status: 'approved' as const, acordOn: '2025-12-19', updatedAt: '2026-11-20T10:00:00Z' };

function setup(store: Partial<ExciseStore> = {}, farm: { id: string } | null = { id: 'f1' }) {
  const excise: ExciseStore = {
    list: vi.fn(async () => [row]),
    set: vi.fn(async (_t, _f, r) => ({ ...r, updatedAt: row.updatedAt })),
    ...store,
  };
  const repo = { getMyFarm: vi.fn(async () => farm) } as unknown as Repo;
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, excise });
  return { app, excise };
}

describe('excise schemes the farm joined', () => {
  it('needs a session and a farm', async () => {
    expect((await request(setup().app).get('/api/excise')).status).toBe(401);
    expect((await request(setup({}, null).app).get('/api/excise').set(auth)).status).toBe(404);
  });

  it('lists the farm\'s rows', async () => {
    const { app, excise } = setup();
    const res = await request(app).get('/api/excise').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enrollments: [row] });
    expect(excise.list).toHaveBeenCalledWith('t', 'f1');
  });

  it('saves an approved acord for the diesel refund in a year it is in force', async () => {
    const { app, excise } = setup();
    const res = await request(app).put('/api/excise/motorina-hg1174/2026').set(auth).send({ status: 'approved', acordOn: '2025-12-19' });
    expect(res.status).toBe(200);
    expect(res.body.enrollment).toMatchObject({ schemeId: 'motorina-hg1174', year: 2026, status: 'approved' });
    expect(excise.set).toHaveBeenCalledWith('t', 'f1', { schemeId: 'motorina-hg1174', year: 2026, status: 'approved', acordOn: '2025-12-19' });
  });

  it('refuses what the catalogue does not allow, before touching the farm', async () => {
    const { app, excise } = setup();
    const put = (path: string, body: object) => request(app).put(`/api/excise/${path}`).set(auth).send(body);
    expect((await put('nu-exista/2026', { status: 'interested' })).body).toEqual({ error: 'unknown_scheme' });
    // A proposal can only be followed; an exemption has no acord.
    expect((await put('motorina-pompa-2027/2027', { status: 'acord_filed' })).body).toEqual({ error: 'cannot_join' });
    expect((await put('energie-regenerabila-art399/2026', { status: 'approved' })).body).toEqual({ error: 'cannot_join' });
    // The diesel refund ends on 31.12.2026 (until the JSON says it was extended).
    const late = await put('motorina-hg1174/2027', { status: 'acord_filed' });
    expect([late.status, late.body]).toEqual([409, { error: 'not_in_force' }]);
    expect(excise.set).not.toHaveBeenCalled();
  });

  it('lets anyone follow a proposal', async () => {
    const res = await request(setup().app).put('/api/excise/motorina-pompa-2027/2027').set(auth).send({ status: 'interested' });
    expect(res.status).toBe(200);
  });

  it('refuses bad input', async () => {
    const { app } = setup();
    const put = (path: string, body: object) => request(app).put(`/api/excise/${path}`).set(auth).send(body);
    expect((await put('motorina-hg1174/2026', { status: 'gata' })).status).toBe(400);
    expect((await put('motorina-hg1174/doi', { status: 'interested' })).status).toBe(400);
    expect((await put('motorina-hg1174/2026', { status: 'interested', acordOn: '2025-12-19' })).status).toBe(400);
    expect((await put('motorina-hg1174/2026', { status: 'interested', farmerId: 'altcineva' })).status).toBe(400);
  });

  it('answers 403 when the farm is only readable (an accountant)', async () => {
    const { app } = setup({ set: vi.fn(async () => { throw new ExciseRefused('rls'); }) });
    const res = await request(app).put('/api/excise/motorina-hg1174/2026').set(auth).send({ status: 'interested' });
    expect([res.status, res.body]).toEqual([403, { error: 'read_only' }]);
  });
});
