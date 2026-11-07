import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import { RepoError, type FarmRow, type NewFarm, type Repo } from './db/repo';

const data = loadData();

/** In-memory repo keyed by token, mirroring what RLS gives us in Supabase. */
function memoryRepo(initial: Record<string, FarmRow> = {}) {
  const farms = { ...initial };
  const created: NewFarm[] = [];
  const repo: Repo = {
    getMyFarm: vi.fn(async (token: string) => farms[token] ?? null),
    createFarm: vi.fn(async (token: string, farm: NewFarm) => {
      if (farms[token]) throw new RepoError('conflict', 'exists');
      created.push(farm);
      farms[token] = {
        id: 'farm-1',
        name: farm.name,
        county: farm.county,
        birth_year: farm.birthYear,
        parcels: farm.parcels.map((p) => ({ crop_id: p.cropId, area_ari: p.areaAri, is_arable: true })),
      };
      return 'farm-1';
    }),
  };
  return { repo, created };
}

const verifyToken = async (token: string) => {
  if (!token.startsWith('good')) throw new Error('bad token');
  return { userId: `user-${token}` };
};

const makeApp = (repo: Repo) =>
  createApp({ corsOrigins: ['http://localhost:5173'], verifyToken, repo, data });

const ion = {
  name: 'Ion',
  county: 'TR',
  age: 55,
  parcels: [
    { cropId: 'grau', areaHa: 8 },
    { cropId: 'porumb', areaHa: 7 },
  ],
};

describe('auth', () => {
  it('GET /api/health is public', async () => {
    const res = await request(makeApp(memoryRepo().repo)).get('/api/health');
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects missing and invalid tokens', async () => {
    const app = makeApp(memoryRepo().repo);
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', 'Bearer forged')).status).toBe(401);
  });
});

describe('POST /api/farmers (onboarding)', () => {
  it('creates the farm and returns the subsidy estimate', async () => {
    const { repo, created } = memoryRepo();
    const res = await request(makeApp(repo)).post('/api/farmers').set('Authorization', 'Bearer good').send(ion);
    expect(res.status).toBe(201);
    expect(res.body.farmerId).toBe('farm-1');
    expect(res.body.subsidies.totals.eur.probable).toBe(319500);
    expect(res.body.subsidies.totals.lei.probable).toBe(1686960);
    expect(created[0]).toEqual({
      name: 'Ion',
      county: 'TR',
      birthYear: data.subsidies.meta.campaign_year - 55,
      parcels: [
        { cropId: 'grau', areaAri: 800 },
        { cropId: 'porumb', areaAri: 700 },
      ],
    });
  });

  it('returns 409 if the user already has a farm', async () => {
    const { repo } = memoryRepo();
    const app = makeApp(repo);
    await request(app).post('/api/farmers').set('Authorization', 'Bearer good').send(ion);
    const res = await request(app).post('/api/farmers').set('Authorization', 'Bearer good').send(ion);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('farm_exists');
  });

  it('validates shape and reference data', async () => {
    const app = makeApp(memoryRepo().repo);
    const post = (body: object) => request(app).post('/api/farmers').set('Authorization', 'Bearer good').send(body);

    expect((await post({ ...ion, parcels: [] })).status).toBe(400);
    const badCounty = await post({ ...ion, county: 'XX' });
    expect(badCounty.status).toBe(400);
    expect(badCounty.body.issues).toContain('unknown_county');
    const badCrop = await post({ ...ion, parcels: [{ cropId: 'orez', areaHa: 3 }] });
    expect(badCrop.body.issues).toContain('unknown_crop');
  });
});

describe('GET /api/subsidies and /api/me', () => {
  it('404 before onboarding, estimate after', async () => {
    const app = makeApp(memoryRepo().repo);
    const auth = { Authorization: 'Bearer good' };
    expect((await request(app).get('/api/subsidies').set(auth)).status).toBe(404);
    expect((await request(app).get('/api/me').set(auth)).body).toEqual({ userId: 'user-good', farmer: null });

    await request(app).post('/api/farmers').set(auth).send(ion);
    const res = await request(app).get('/api/subsidies').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.totals.advanceLei).toBe(1265220);
  });

  it('hides internal errors', async () => {
    const repo: Repo = {
      getMyFarm: async () => {
        throw new Error('connection refused at 10.0.0.1');
      },
      createFarm: async () => '',
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(makeApp(repo)).get('/api/subsidies').set('Authorization', 'Bearer good');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
  });
});
