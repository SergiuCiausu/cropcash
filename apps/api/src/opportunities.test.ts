import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData, type StoredOpportunity } from '@cropcash/shared';
import { createApp } from './app';
import type { FarmRow, Repo } from './db/repo';
import { allWords, anyWord, type MonitorReader } from './monitor/reader';

const data = loadData();
const auth = { Authorization: 'Bearer good' };
const verifyToken = async () => ({ userId: 'u1' });
const farm = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
} as unknown as FarmRow;
const opportunity: StoredOpportunity = {
  stable_key: 'afir:DR-14:alte',
  kind: 'afir',
  programme: 'PS PAC 2023-2027',
  title: 'DR-14: Componenta ALTE SECTOARE',
  status: 'open',
  open_date: '2026-10-06',
  deadline: '2026-12-16',
  budget_eur: 1000,
  applicants: null,
  region: 'Național',
  url: 'https://afir.ro/x',
  relevance: 'direct',
  relevance_note: null,
  confidence: 'high',
  evidence: null,
};

function setup(options: { monitor?: MonitorReader; deadline?: string | null } = {}) {
  const { monitor } = options;
  const deadline = 'deadline' in options ? options.deadline : '2026-12-16';
  const repo = {
    getMyFarm: async () => farm,
    opportunityDeadline: vi.fn(async () => deadline),
    followOpportunity: vi.fn(async () => {}),
    unfollowOpportunity: vi.fn(async () => {}),
  } as unknown as Repo;
  const app = createApp({
    corsOrigins: [],
    verifyToken,
    repo,
    data,
    now: () => new Date('2026-11-07T10:00:00Z'),
    getRates: async () => null,
    monitor,
  });
  return { app, repo };
}
const reader = (over: Partial<MonitorReader> = {}): MonitorReader => ({
  load: vi.fn(async () => ({ opportunities: [opportunity] })),
  ...over,
});
const call = (app: ReturnType<typeof createApp>, name: string, body: object = {}) =>
  request(app).post(`/api/functions/${name}`).set(auth).send(body);

describe('reading monitor data', () => {
  it('loads only what the function asked for, with the session token', async () => {
    const monitor = reader();
    const { app } = setup({ monitor });
    const res = await call(app, 'match_opportunities');
    expect(res.status).toBe(200);
    // DR-14 isn't open to a person: the guide says so, and Ion has no PFA on file.
    expect(res.body.data.check[0]).toMatchObject({ key: 'afir:DR-14:alte', level: 'near', doubts: [{ code: 'needs_company' }] });
    expect(monitor.load).toHaveBeenCalledWith(['opportunities'], {}, 'good');
  });

  it('leaves the monitor alone for plan functions', async () => {
    const monitor = reader();
    const { app } = setup({ monitor });
    expect((await call(app, 'get_salary')).status).toBe(200);
    expect(monitor.load).not.toHaveBeenCalled();
  });

  it('answers 503, not 500, when the monitor data is out of reach', async () => {
    const { app } = setup({ monitor: reader({ load: async () => Promise.reject(new Error('down')) }) });
    expect((await call(app, 'match_opportunities')).status).toBe(503);
    expect((await call(setup().app, 'match_opportunities')).status).toBe(503);
  });

  it('checks the input first', async () => {
    const monitor = reader();
    const { app } = setup({ monitor });
    expect((await call(app, 'search_documents', { text: 'a' })).status).toBe(400);
    expect(monitor.load).not.toHaveBeenCalled();
  });
});

describe('document search terms', () => {
  it('drops diacritics and search operators', () => {
    expect(allWords('Subvenție, "motorină"!')).toBe('subventie motorina');
    expect(anyWord('subvenție -motorină')).toBe('subventie or motorina');
  });
});

describe('following a call', () => {
  const follow = (app: ReturnType<typeof createApp>, key = 'afir:DR-14:alte') =>
    request(app).post('/api/opportunities/follow').set(auth).send({ key });

  it('uses the farm from the session', async () => {
    const { app, repo } = setup();
    expect((await follow(app)).status).toBe(201);
    expect(repo.followOpportunity).toHaveBeenCalledWith('good', 'farm-1', 'afir:DR-14:alte');
  });

  it('refuses a call that does not exist, or has no date for the calendar', async () => {
    const unknown = setup({ deadline: undefined });
    expect((await follow(unknown.app)).body.error).toBe('unknown_opportunity');
    const noDate = setup({ deadline: null });
    expect((await follow(noDate.app)).body.error).toBe('no_deadline');
    expect(noDate.repo.followOpportunity).not.toHaveBeenCalled();
  });

  it('checks the input and needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/opportunities/follow').set(auth).send({ key: '' })).status).toBe(400);
    expect((await request(app).post('/api/opportunities/follow').send({ key: 'x' })).status).toBe(401);
  });

  it('takes it out again', async () => {
    const { app, repo } = setup();
    expect((await request(app).post('/api/opportunities/unfollow').set(auth).send({ key: 'x' })).status).toBe(200);
    expect(repo.unfollowOpportunity).toHaveBeenCalledWith('good', 'x');
  });
});
