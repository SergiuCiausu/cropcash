import { FARM_SELECT } from './db/repo';
import { MONEY_FARM_SELECT } from './db/admin';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildFarmPlan, computeFarmPlan, findFunction, loadData, planUnverified, planView } from '@cropcash/shared';
import type { ApiaDecision, HarvestsInput } from '@cropcash/shared';
import { createApp } from './app';
import { WeatherUnavailableError, type WeatherService } from './weather';
import { RepoError, type FarmRow, type NewCredit, type NewExpense, type NewFarm, type NewSale, type Repo } from './db/repo';

const data = loadData();

const KNOWN_TX = '22222222-2222-4222-8222-222222222222';

/** In-memory repo keyed by token, mirroring what RLS gives us in Supabase. */
function memoryRepo(initial: Record<string, FarmRow> = {}) {
  const farms = { ...initial };
  const created: NewFarm[] = [];
  const credits: (NewCredit & { groupId: string })[] = [];
  let envelopes: Record<string, number> | null = null;
  const sales: NewSale[] = [];
  const expenses: NewExpense[] = [];
  const tasks = new Set<string>();
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
    addSale: vi.fn(async (token: string, _farmerId: string, s: NewSale) => {
      const id = `tx-${sales.length}`;
      sales.push(s);
      const farm = farms[token]!;
      farm.transactions = [
        ...(farm.transactions ?? []),
        { id, kind: 'sale', category: null, crop_id: s.cropId, amount_bani: s.amountBani, occurred_at: `${s.date}T12:00:00Z`, note: s.note ?? null },
      ];
      return id;
    }),
    addExpense: vi.fn(async (token: string, e: NewExpense) => {
      if (!farms[token]) throw new RepoError('not_found', 'no farm');
      expenses.push(e);
      return 'tx-e';
    }),
    undoTransaction: vi.fn(async (_token: string, id: string) => id === KNOWN_TX),
    completeTask: vi.fn(async (_token: string, _farmerId: string, taskId: string) => {
      tasks.add(taskId);
    }),
    reopenTask: vi.fn(async (_token: string, taskId: string) => tasks.delete(taskId)),
    opportunityDeadline: vi.fn(async () => undefined),
    followOpportunity: vi.fn(async () => {}),
    unfollowOpportunity: vi.fn(async () => {}),
    setHarvests: vi.fn(async (token: string, _farmerId: string, harvests: HarvestsInput) => {
      farms[token]!.harvests = harvests;
    }),
    setApiaDecision: vi.fn(async (token: string, _farmerId: string, decision: ApiaDecision | null) => {
      farms[token]!.apia_decision = decision;
    }),
    setSalary: vi.fn(async (token: string, _farmerId: string, salaryBani: number) => {
      farms[token]!.salary_bani = salaryBani;
    }),
    setPensionFund: vi.fn(async (token: string, _farmerId: string, fundId: string | null) => {
      farms[token]!.pension_fund_id = fundId;
    }),
    updateFarm: vi.fn(async (token: string, farm: NewFarm) => {
      if (farm.startBalanceBani === 100) throw new RepoError('invalid', 'envelopes exceed money');
      farms[token]!.parcels = farm.parcels.map((p) => ({ crop_id: p.cropId, area_ari: p.areaAri, is_arable: true }));
    }),
  };
  return { repo, farms, created, credits, sales, expenses, tasks, getEnvelopes: () => envelopes };
}

const verifyToken = async (token: string) => {
  if (!token.startsWith('good')) throw new Error('bad token');
  return { userId: `user-${token}` };
};

const makeApp = (repo: Repo, weather?: WeatherService) =>
  createApp({ corsOrigins: ['http://localhost:5173'], verifyToken, repo, data, weather });

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
    expect(res.body.subsidies.totals.lei.probable).toBe(1686577);
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
    expect(res.body.totals.advanceLei).toBe(1264932);
  });

  it('hides internal errors', async () => {
    const repo: Repo = {
      ...memoryRepo().repo,
      getMyFarm: async () => {
        throw new Error('connection refused at 10.0.0.1');
      },
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

  it('accepting the split fixes the monthly salary at the safe amount', async () => {
    const { app, repo } = await onboarded();
    const split = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, pension: 0 };
    await request(app).put('/api/envelopes').set(auth).send(split);
    const farm = await repo.getMyFarm('good');
    const safe = computeFarmPlan({ ...farm!, salary_bani: null }, data).salary.salary;
    expect(repo.setSalary).toHaveBeenCalledWith('good', 'farm-1', safe);
    expect(farm!.salary_bani).toBe(safe);
  });

  it('a declared credit also re-fixes the salary', async () => {
    const { app, repo } = await onboarded();
    await request(app).post('/api/credits').set(auth).send({ amountLei: 14800, takeMonth: '2027-04', repayMonth: '2027-07' });
    expect(repo.setSalary).toHaveBeenCalledTimes(1);
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
    const split = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, pension: 0 };
    expect((await request(app).put('/api/envelopes').set(auth).send(split)).status).toBe(204);
    expect(getEnvelopes()).toEqual(split);
  });

  it('refuses a split larger than the money available, or negative', async () => {
    const { app } = await onboarded();
    const tooMuch = { salary: 3_600_000, spring_inputs: 0, debts: 0, pension: 0 };
    const res = await request(app).put('/api/envelopes').set(auth).send(tooMuch);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_much');
    const negative = { salary: -1, spring_inputs: 0, debts: 0, pension: 0 };
    expect((await request(app).put('/api/envelopes').set(auth).send(negative)).status).toBe(400);
  });
});

describe('POST /api/functions/:name', () => {
  const farm: FarmRow = {
    id: 'farm-1',
    name: 'Ion',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
  };
  const app = () =>
    createApp({
      corsOrigins: [],
      verifyToken,
      repo: memoryRepo({ good: farm }).repo,
      data,
      now: () => new Date('2026-11-07T10:00:00Z'),
    });
  const call = (name: string, input?: object, token = 'good') =>
    request(app()).post(`/api/functions/${name}`).set('Authorization', `Bearer ${token}`).send(input);

  it('needs a session', async () => {
    expect((await request(app()).post('/api/functions/get_plan')).status).toBe(401);
  });

  it('404 before onboarding', async () => {
    const res = await call('get_plan', {}, 'good-no-farm');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_farm');
  });

  it('works with no body at all', async () => {
    expect((await call('get_plan')).status).toBe(200);
  });

  it('gives the same answer as the calculation the phone runs', async () => {
    const res = await call('get_plan', {});
    const onPhone = buildFarmPlan(farm, data, { month: '2026-11' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(planView(onPhone, 'medium'));
    expect(res.body.data.salary.salary).toBe(105_000);
    expect(res.body.data.creditSuggestion.salary).toBe(295_000);
    expect(res.body.data.creditSuggestion.credit.amount).toBe(1_510_000);
    expect(res.body.data.creditSuggestion.credit.takeMonth).toBe('2027-04');
    expect(res.body.asOf).toBe('2026-11-07');
    expect(res.body.unverified).toEqual(planUnverified(onPhone.subsidies));
  });

  it('passes the input through and refuses a bad one', async () => {
    const bad = await call('get_plan', { scenario: 'bad' });
    expect(bad.body.data.scenario).toBe('bad');
    expect(bad.body.data.salary.salary).toBe(105_000);
    expect((await call('get_plan', { scenario: 'great' })).status).toBe(400);
  });

  it('never runs a write or an unknown name', async () => {
    expect(findFunction('add_credit')).toBeDefined();
    const res = await call('add_credit', { amountLei: 1000, takeMonth: '2027-04', repayMonth: '2027-08' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('unknown_function');
    expect((await call('nope')).status).toBe(404);
  });
});

describe('GET /api/weather', () => {
  const forecast = { countyCode: 'TR', fetchedAt: '2026-11-07T10:00:00.000Z', stale: false, days: [] };
  const farm: FarmRow = { id: 'f', name: 'Ion', county: 'TR', birth_year: 1971, start_balance_bani: 0, parcels: [] };
  const auth = 'Bearer good-1';

  it('needs a session', async () => {
    const res = await request(makeApp(memoryRepo().repo)).get('/api/weather');
    expect(res.status).toBe(401);
  });

  it("uses the farm's county, not the client's", async () => {
    const weather = { get: vi.fn(async () => forecast) };
    const res = await request(makeApp(memoryRepo({ 'good-1': farm }).repo, weather))
      .get('/api/weather?county=DJ')
      .set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(forecast);
    expect(weather.get).toHaveBeenCalledWith('TR');
  });

  it('answers 404 without a farm', async () => {
    const weather = { get: vi.fn(async () => forecast) };
    const res = await request(makeApp(memoryRepo().repo, weather)).get('/api/weather').set('Authorization', auth);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_farm');
  });

  it('answers 503 when there is nothing to show', async () => {
    const weather = {
      get: vi.fn(async () => {
        throw new WeatherUnavailableError();
      }),
    };
    const res = await request(makeApp(memoryRepo({ 'good-1': farm }).repo, weather))
      .get('/api/weather')
      .set('Authorization', auth);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('weather_unavailable');
  });
});

describe('records, tasks and the farm', () => {
  const start = (): FarmRow => ({
    id: 'farm-1',
    name: 'Ion',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
  });
  const setup = () => {
    const mem = memoryRepo({ good: start() });
    const app = createApp({
      corsOrigins: [],
      verifyToken,
      repo: mem.repo,
      data,
      now: () => new Date('2026-11-07T10:00:00Z'),
      getRates: async () => null,
    });
    return { ...mem, app };
  };
  const auth = { Authorization: 'Bearer good' };

  it("passes the phone's clientId to the database, so a resent record is saved once", async () => {
    const { app, sales, expenses } = setup();
    const clientId = '33333333-3333-4333-8333-333333333333';
    await request(app).post('/api/sales').set(auth).send({ cropId: 'grau', date: '2026-11-02', totalLei: 500, clientId });
    await request(app).post('/api/expenses').set(auth).send({ category: 'diesel', amountLei: 300, date: '2026-11-02', clientId });
    expect(sales[0]!.clientId).toBe(clientId);
    expect(expenses[0]!.clientId).toBe(clientId);
  });

  it('refuses a clientId that is not a uuid', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/sales').set(auth).send({ cropId: 'grau', date: '2026-11-02', totalLei: 500, clientId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('records a sale from tonnes and price, in whole bani, and proposes a split', async () => {
    const { app, sales } = setup();
    const res = await request(app).post('/api/sales').set(auth).send({ cropId: 'grau', date: '2026-11-02', tonnes: 10, pricePerKgLei: 1.05 });
    expect(res.status).toBe(201);
    expect(sales[0]!.amountBani).toBe(1_050_000);
    expect(Object.values(res.body.split as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(1_050_000);
  });

  it('refuses a future date, an unknown crop and a bad body', async () => {
    const { app, sales } = setup();
    const post = (body: object) => request(app).post('/api/sales').set(auth).send(body);
    const future = await post({ cropId: 'grau', date: '2026-11-08', totalLei: 100 });
    expect(future.body.error).toBe('future_date');
    expect((await post({ cropId: 'orez', date: '2026-11-02', totalLei: 100 })).status).toBe(400);
    expect((await post({ cropId: 'grau', date: '2026-11-02' })).status).toBe(400);
    expect(sales).toHaveLength(0);
  });

  it('counts the day in Romania when checking for a future date', async () => {
    const mem = memoryRepo({ good: start() });
    const app = createApp({ corsOrigins: [], verifyToken, repo: mem.repo, data, now: () => new Date('2026-12-31T22:30:00Z'), getRates: async () => null });
    const res = await request(app).post('/api/sales').set(auth).send({ cropId: 'grau', date: '2027-01-01', totalLei: 100 });
    expect(res.status).toBe(201);
  });

  it('records an expense and returns the salary', async () => {
    const { app, expenses } = setup();
    const res = await request(app).post('/api/expenses').set(auth).send({ category: 'repairs', amountLei: 900.5, date: '2026-11-02', envelope: 'spring_inputs' });
    expect(res.status).toBe(201);
    expect(expenses[0]).toMatchObject({ amountBani: 90_050, envelope: 'spring_inputs' });
    expect(typeof res.body.salary).toBe('number');
  });

  it('404 without a farm', async () => {
    const { app } = setup();
    const noFarm = { Authorization: 'Bearer good-other' };
    expect((await request(app).post('/api/sales').set(noFarm).send({ cropId: 'grau', date: '2026-11-02', totalLei: 1 })).status).toBe(404);
    expect((await request(app).post('/api/expenses').set(noFarm).send({ category: 'other', amountLei: 1, date: '2026-11-02' })).status).toBe(404);
  });

  it('undoes a known record, 404 for unknown, 400 for junk', async () => {
    const { app } = setup();
    expect((await request(app).delete(`/api/transactions/${KNOWN_TX}`).set(auth)).status).toBe(204);
    expect((await request(app).delete('/api/transactions/33333333-3333-4333-8333-333333333333').set(auth)).status).toBe(404);
    expect((await request(app).delete('/api/transactions/junk').set(auth)).status).toBe(400);
  });

  it('marks a task done and reopens it, only for real calendar events', async () => {
    const { app, tasks } = setup();
    const path = `/api/tasks/${encodeURIComponent('apia-cerere:2027')}`;
    expect((await request(app).put(path).set(auth)).status).toBe(204);
    expect(tasks.has('apia-cerere:2027')).toBe(true);
    expect((await request(app).delete(path).set(auth)).status).toBe(204);
    expect((await request(app).delete(path).set(auth)).status).toBe(404);
    expect((await request(app).put(`/api/tasks/${encodeURIComponent('made-up:2027')}`).set(auth)).status).toBe(400);
  });

  it('updates the farm and returns the new subsidy', async () => {
    const { app } = setup();
    const res = await request(app).put('/api/farmers/me').set(auth).send({ ...ion, startBalanceLei: 35_000 });
    expect(res.status).toBe(200);
    expect(res.body.subsidies.totals.lei.probable).toBe(1686577);
  });

  it('refuses an edit that leaves envelopes bigger than the money, or a missing balance', async () => {
    const { app } = setup();
    const low = await request(app).put('/api/farmers/me').set(auth).send({ ...ion, startBalanceLei: 1 });
    expect(low.status).toBe(400);
    expect(low.body.error).toBe('too_much');
    expect((await request(app).put('/api/farmers/me').set(auth).send(ion)).status).toBe(400);
  });
});

describe('what the payout reads', () => {
  it('fetches every column the plan reads, the same as the screens', () => {
    for (const select of [FARM_SELECT, MONEY_FARM_SELECT]) {
      for (const column of ['harvests', 'apia_decision', 'salary_bani', 'demo_now', 'planted_month', 'category', 'source', 'expected_payment_id', 'pension_plans', 'expected_payments', 'envelopes']) {
        expect(select, column).toContain(column);
      }
    }
  });
});

describe('harvests', () => {
  const stored = (): FarmRow => ({
    id: 'farm-1',
    name: 'Ion',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 3_500_000,
    parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
  });
  const setup = (farms: Record<string, FarmRow> = { good: stored() }) => {
    const mem = memoryRepo(farms);
    const app = createApp({
      corsOrigins: [],
      verifyToken,
      repo: mem.repo,
      data,
      now: () => new Date('2026-11-07T10:00:00Z'),
      getRates: async () => null,
    });
    return { ...mem, app };
  };
  const auth = { Authorization: 'Bearer good' };
  const harvests: HarvestsInput = {
    years: [{ year: 2027, status: 'open', openingBani: 3_500_000, parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }] }],
    gathered: [{ cropId: 'grau', areaHa: 8, tonnes: 40, priceLeiPerKg: null, storedTonnes: 12 }],
  };

  describe('a crop of the farmer', () => {
    const orz = {
      id: 'own-orz-1',
      name: 'Orz',
      yieldTPerHa: 5,
      badYieldTPerHa: null,
      priceLeiPerKg: 0.9,
      costs: { sowingLeiPerHa: 1500, careLeiPerHa: 900, harvestLeiPerHa: 600 },
      sowingMonth: 10,
      harvestMonth: 7,
    };
    const withOrz: HarvestsInput = {
      years: [{ year: 2027, status: 'open', openingBani: 3_500_000, parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'own-orz-1', areaHa: 4 }] }],
      gathered: [],
      ownCrops: [orz],
    };
    const edit = { name: 'Ion', county: 'TR', age: 55, startBalanceLei: 35_000, parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'own-orz-1', areaHa: 4 }] };

    it('is refused on the farm until the farm describes it', async () => {
      const { app } = setup();
      expect((await request(app).put('/api/farmers/me').set(auth).send(edit)).status).toBe(400);
    });

    it('is accepted once saved, and sales can name it', async () => {
      const { app, farms } = setup();
      expect((await request(app).put('/api/farmers/me/harvests').set(auth).send(withOrz)).status).toBe(200);
      expect((await request(app).put('/api/farmers/me').set(auth).send(edit)).status).toBe(200);
      expect(farms.good!.parcels.map((p) => p.crop_id)).toContain('own-orz-1');
      const sale = await request(app).post('/api/sales').set(auth).send({ cropId: 'own-orz-1', date: '2026-11-02', totalLei: 100 });
      expect(sale.status).toBe(201);
    });

    it('is still unknown to another farm', async () => {
      const { app } = setup();
      const sale = await request(app).post('/api/sales').set(auth).send({ cropId: 'own-orz-1', date: '2026-11-02', totalLei: 100 });
      expect(sale.status).toBe(400);
    });
  });

  it('saves them for the farmer and shows them in /api/me', async () => {
    const { app, farms } = setup();
    const res = await request(app).put('/api/farmers/me/harvests').set(auth).send(harvests);
    expect(res.status).toBe(200);
    expect(farms.good!.harvests).toEqual(harvests);
    expect((await request(app).get('/api/me').set(auth)).body.farmer.harvests).toEqual(harvests);
  });

  it('replaces what was there', async () => {
    const { app, farms } = setup();
    await request(app).put('/api/farmers/me/harvests').set(auth).send(harvests);
    await request(app).put('/api/farmers/me/harvests').set(auth).send({ ...harvests, gathered: [] });
    expect(farms.good!.harvests?.gathered).toEqual([]);
  });

  it('needs a signed-in farmer', async () => {
    expect((await request(setup().app).put('/api/farmers/me/harvests').send(harvests)).status).toBe(401);
  });

  it('refuses a user without a farm', async () => {
    const { app, repo } = setup({});
    const res = await request(app).put('/api/farmers/me/harvests').set(auth).send(harvests);
    expect(res.status).toBe(404);
    expect(repo.setHarvests).not.toHaveBeenCalled();
  });

  it('refuses a bad document and saves nothing', async () => {
    const { app, repo } = setup();
    const [year] = harvests.years;
    const noRecords = await request(app).put('/api/farmers/me/harvests').set(auth).send({ ...harvests, years: [{ ...year, records: [] }] });
    expect(noRecords.status).toBe(400);
    const unknown = await request(app).put('/api/farmers/me/harvests').set(auth).send({ ...harvests, years: [{ ...year, parcels: [{ cropId: 'nou', areaHa: 1 }] }] });
    expect(unknown.body).toEqual({ error: 'invalid_input', issues: ['unknown_crop'] });
    const twice = await request(app).put('/api/farmers/me/harvests').set(auth).send({ ...harvests, years: [year, year] });
    expect(twice.body.issues).toEqual(['duplicate_year']);
    expect(repo.setHarvests).not.toHaveBeenCalled();
  });

  it('files a sale and an expense under the harvest the farmer chose', async () => {
    const { app, repo } = setup();
    const sale = { cropId: 'grau', date: '2026-11-01', totalLei: 1000, harvestYear: 2026 };
    expect((await request(app).post('/api/sales').set(auth).send(sale)).status).toBe(201);
    expect(repo.addSale).toHaveBeenCalledWith('good', 'farm-1', expect.objectContaining({ harvestYear: 2026 }));
    const expense = { category: 'diesel', amountLei: 100, date: '2026-11-01', harvestYear: 2026 };
    expect((await request(app).post('/api/expenses').set(auth).send(expense)).status).toBe(201);
    expect(repo.addExpense).toHaveBeenCalledWith('good', expect.objectContaining({ harvestYear: 2026 }));
  });

  it('refuses a harvest year outside the range', async () => {
    const sale = { cropId: 'grau', date: '2026-11-01', totalLei: 1000, harvestYear: 1800 };
    expect((await request(setup().app).post('/api/sales').set(auth).send(sale)).status).toBe(400);
  });

  it('keeps the planting month when a farm is created or edited', async () => {
    const { app, repo } = setup();
    const farm = { name: 'Ion', county: 'TR', age: 55, startBalanceLei: 35_000, parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }] };
    expect((await request(app).put('/api/farmers/me').set(auth).send(farm)).status).toBe(200);
    expect(repo.updateFarm).toHaveBeenCalledWith('good', expect.objectContaining({
      parcels: [{ cropId: 'grau', areaAri: 800, plantedMonth: '2026-10' }],
    }));
  });
});

describe('exchange rates', () => {
  const rates = { date: '2026-11-06', rates: { RON: 5.3403, USD: 1.1165, GBP: 0.83415 } };
  const farm: FarmRow = {
    id: 'farm-1',
    name: 'Ion',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
  };
  const app = (found: typeof rates | null) =>
    createApp({ corsOrigins: [], verifyToken, repo: memoryRepo({ good: farm }).repo, data, getRates: async () => found });
  const auth = { Authorization: 'Bearer good' };

  it('need a session', async () => {
    expect((await request(app(rates)).get('/api/exchange-rates')).status).toBe(401);
  });

  it('work before onboarding, and answer null rather than guess', async () => {
    const before = { Authorization: 'Bearer good-new' };
    expect((await request(app(rates)).get('/api/exchange-rates').set(before)).body).toEqual({ rates });
    expect((await request(app(null)).get('/api/exchange-rates').set(auth)).body).toEqual({ rates: null });
  });

  it('reach the functions that use them', async () => {
    const res = await request(app(rates)).post('/api/functions/convert_currency').set(auth).send({ amount: 534_030, from: 'RON', to: 'EUR' });
    expect(res.body.data).toEqual({ amount: 100_000, currency: 'EUR', ratesDate: '2026-11-06' });
  });

  it('never run a write through the read route', async () => {
    const res = await request(app(rates)).post('/api/functions/record_sale').set(auth).send({ cropId: 'grau', date: '2026-11-02', totalLei: 1 });
    expect(res.body.error).toBe('unknown_function');
  });
});

describe('pension fund', () => {
  const farm = (): FarmRow => ({
    id: 'farm-1',
    name: 'Ion',
    county: 'TR',
    birth_year: data.subsidies.meta.campaign_year - 55,
    parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
  });
  const setup = () =>
    createApp({ corsOrigins: [], verifyToken, repo: memoryRepo({ good: farm() }).repo, data, getRates: async () => null });
  const auth = { Authorization: 'Bearer good' };

  it('saves the choice, and the suggestion then follows that fund', async () => {
    const app = setup();
    const put = await request(app).put('/api/pension/fund').set(auth).send({ fundId: 'stabil' });
    expect(put.status).toBe(204);
    const res = await request(app).post('/api/functions/suggest_pension').set(auth).send({});
    expect(res.body.data).toMatchObject({ fundName: 'Stabil', minimum: 2_500, minimumVerified: true });
  });

  it('marks an unconfirmed minimum in the answer', async () => {
    const app = setup();
    const res = await request(app).post('/api/functions/suggest_pension').set(auth).send({ fundId: 'azt-moderato' });
    expect(res.body.data.minimumVerified).toBe(false);
    expect(res.body.unverified).toContain('pension_fund_minimum');
  });

  it('tells the slider when the amount is under the minimum', async () => {
    const app = setup();
    const res = await request(app).post('/api/functions/simulate_pension').set(auth).send({ monthly: 2_000, fundId: 'stabil' });
    expect(res.body.data).toMatchObject({ minimum: 2_500, belowMinimum: true });
  });

  it('refuses a fund that is not on the list, and clears with null', async () => {
    const app = setup();
    expect((await request(app).put('/api/pension/fund').set(auth).send({ fundId: 'made-up' })).status).toBe(400);
    expect((await request(app).put('/api/pension/fund').set(auth).send({ fundId: null })).status).toBe(204);
  });

  it('404 without a farm', async () => {
    const res = await request(setup()).put('/api/pension/fund').set({ Authorization: 'Bearer good-new' }).send({ fundId: 'stabil' });
    expect(res.status).toBe(404);
  });
});
