import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { computeFarmPlan, loadData } from '@cropcash/shared';
import { createApp } from './app';
import { RepoError, type FarmRow, type NewCredit, type NewFarm, type Repo } from './db/repo';

const data = loadData();

/** In-memory repo keyed by token, mirroring what RLS gives us in Supabase. */
function memoryRepo(initial: Record<string, FarmRow> = {}) {
  const farms = { ...initial };
  const created: NewFarm[] = [];
  const credits: (NewCredit & { groupId: string })[] = [];
  let envelopes: Record<string, number> | null = null;
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
        start_balance_bani: farm.startBalanceBani,
        parcels: farm.parcels.map((p) => ({ crop_id: p.cropId, area_ari: p.areaAri, is_arable: true })),
      };
      return 'farm-1';
    }),
    addCredit: vi.fn(async (_token: string, _farmerId: string, c: NewCredit) => {
      const groupId = '11111111-1111-4111-8111-111111111111';
      credits.push({ ...c, groupId });
      return groupId;
    }),
    deleteCredit: vi.fn(async (_token: string, groupId: string) => credits.some((c) => c.groupId === groupId)),
    setEnvelopes: vi.fn(async (token: string, balances: Record<string, number>) => {
      const total = Object.values(balances).reduce((a, b) => a + b, 0);
      if (total > (farms[token]?.start_balance_bani ?? 0)) throw new RepoError('invalid', 'too much');
      envelopes = balances;
    }),
    setSalary: vi.fn(async (token: string, _farmerId: string, salaryBani: number) => {
      farms[token] = { ...farms[token]!, salary_bani: salaryBani };
    }),
  };
  return { repo, created, credits, getEnvelopes: () => envelopes };
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
      startBalanceBani: 0,
      parcels: [
        { cropId: 'grau', areaAri: 800 },
        { cropId: 'porumb', areaAri: 700 },
      ],
    });
  });

  it('stores the optional start balance in bani', async () => {
    const { repo, created } = memoryRepo();
    await request(makeApp(repo))
      .post('/api/farmers')
      .set('Authorization', 'Bearer good')
      .send({ ...ion, startBalanceLei: 35000 });
    expect(created[0]!.startBalanceBani).toBe(3_500_000);
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
      addCredit: async () => '',
      deleteCredit: async () => false,
      setEnvelopes: async () => {},
      setSalary: async () => {},
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(makeApp(repo)).get('/api/subsidies').set('Authorization', 'Bearer good');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
  });
});

describe('credits and envelopes (step 5)', () => {
  const auth = { Authorization: 'Bearer good' };
  const onboarded = async () => {
    const m = memoryRepo();
    const app = makeApp(m.repo);
    await request(app).post('/api/farmers').set(auth).send({ ...ion, startBalanceLei: 35000 });
    return { ...m, app };
  };

  it('declares a credit as a take/repay pair on the first of the month', async () => {
    const { app, credits } = await onboarded();
    const res = await request(app)
      .post('/api/credits')
      .set(auth)
      .send({ amountLei: 14800, takeMonth: '2027-04', repayMonth: '2027-11' });
    expect(res.status).toBe(201);
    expect(credits[0]).toMatchObject({ amountBani: 1_480_000, takeDate: '2027-04-01', repayDate: '2027-11-01' });
  });

  it('rejects a repayment before the credit and silly amounts', async () => {
    const { app } = await onboarded();
    const post = (b: object) => request(app).post('/api/credits').set(auth).send(b);
    expect((await post({ amountLei: 14800, takeMonth: '2027-04', repayMonth: '2027-03' })).status).toBe(400);
    expect((await post({ amountLei: 0, takeMonth: '2027-04', repayMonth: '2027-11' })).status).toBe(400);
    expect((await post({ amountLei: 1000, takeMonth: '2027-13', repayMonth: '2028-01' })).status).toBe(400);
  });

  it('deletes a credit by group id, 404 for unknown, 400 for junk', async () => {
    const { app } = await onboarded();
    await request(app).post('/api/credits').set(auth).send({ amountLei: 1000, takeMonth: '2027-04', repayMonth: '2027-11' });
    expect((await request(app).delete('/api/credits/11111111-1111-4111-8111-111111111111').set(auth)).status).toBe(204);
    expect((await request(app).delete('/api/credits/22222222-2222-4222-8222-222222222222').set(auth)).status).toBe(404);
    expect((await request(app).delete('/api/credits/not-a-uuid').set(auth)).status).toBe(400);
  });

  it('saves an envelope split within the money available', async () => {
    const { app, getEnvelopes } = await onboarded();
    const split = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, risk_fund: 0, pension: 0 };
    expect((await request(app).put('/api/envelopes').set(auth).send(split)).status).toBe(204);
    expect(getEnvelopes()).toEqual(split);
  });

  it('a credit already received cannot be deleted (409)', async () => {
    const farm = {
      id: 'farm-1',
      name: 'Ion',
      county: 'TR',
      birth_year: 1971,
      parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
      expected_payments: [
        { id: 'c-in', group_id: '33333333-3333-4333-8333-333333333333', kind: 'credit', direction: 'in' as const, amount_probable_bani: 1_480_000, window_start: '2027-04-01', status: 'planned' },
      ],
      transactions: [{ amount_bani: 1_480_000, kind: 'credit' as const, occurred_at: '2027-04-01T09:00:00Z', expected_payment_id: 'c-in' }],
    };
    const m = memoryRepo({ good: farm });
    const res = await request(makeApp(m.repo)).delete('/api/credits/33333333-3333-4333-8333-333333333333').set(auth);
    expect(res.status).toBe(409);
    expect(m.repo.deleteCredit).not.toHaveBeenCalled();
  });

  it('accepting the split fixes the monthly salary at the safe amount (step 9)', async () => {
    const { app, repo } = await onboarded();
    const split = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, risk_fund: 0, pension: 0 };
    await request(app).put('/api/envelopes').set(auth).send(split);
    const farm = await repo.getMyFarm('good');
    const safe = computeFarmPlan({ ...farm!, salary_bani: null }, data).salary.salary;
    expect(repo.setSalary).toHaveBeenCalledWith('good', 'farm-1', safe);
    expect(farm!.salary_bani).toBe(safe);
  });

  it('a declared credit also re-fixes the salary', async () => {
    const { app, repo } = await onboarded();
    await request(app).post('/api/credits').set(auth).send({ amountLei: 14800, takeMonth: '2027-04', repayMonth: '2027-11' });
    expect(repo.setSalary).toHaveBeenCalledTimes(1);
  });

  it('refuses a split larger than the money available, or negative', async () => {
    const { app } = await onboarded();
    const tooMuch = { salary: 3_600_000, spring_inputs: 0, debts: 0, risk_fund: 0, pension: 0 };
    const res = await request(app).put('/api/envelopes').set(auth).send(tooMuch);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_much');
    const negative = { salary: -1, spring_inputs: 0, debts: 0, risk_fund: 0, pension: 0 };
    expect((await request(app).put('/api/envelopes').set(auth).send(negative)).status).toBe(400);
  });
});
