/* One person, several farms (docs/workspaces-plan.md step 4, migration 039), on the real Supabase.
   Run with `npm run test:integration` after `npm run db:migrate`.

   Done when: a user creates a 2nd farm, switches, and the data never mixes.
   Elena makes two farms through the API, as the phone does. Carla is Elena's accountant on the first one.
   Sorin has no farm. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { loadData } from '../../packages/shared/src';
import { supabaseTokenVerifier } from '../../apps/api/src/middleware/auth';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const password = `Test-${stamp}-pw`;

interface TestUser {
  id: string;
  token: string;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `severalfarms-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token };
}

const app = createApp({
  corsOrigins: ['http://localhost:5173'],
  verifyToken: supabaseTokenVerifier(url),
  repo: supabaseRepo(supabaseFactory(url, anonKey, serviceKey)),
  data: loadData(),
  getRates: async () => null,
});
const as = (u: TestUser, farm?: string) => ({ Authorization: `Bearer ${u.token}`, ...(farm ? { 'X-Farm-Id': farm } : {}) });
const onboarding = (name: string, ha: number, clientId: string) => ({ name, county: 'TR', age: 50, startBalanceLei: 10_000, parcels: [{ cropId: 'grau', areaHa: ha }], clientId });

let elena: TestUser, carla: TestUser, sorin: TestUser;
let first: string, second: string;

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [elena, carla, sorin] = await Promise.all(['elena', 'carla', 'sorin'].map(makeUser));
});

afterAll(async () => {
  await Promise.all([elena, carla, sorin].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('making farms', () => {
  it('the first farm, then the same tap again: still one farm', async () => {
    const key = crypto.randomUUID();
    const made = await request(app).post('/api/farmers').set(as(elena)).send(onboarding('La deal', 10, key));
    expect(made.status).toBe(201);
    first = made.body.farmerId;
    const again = await request(app).post('/api/farmers').set(as(elena)).send(onboarding('La deal', 10, key));
    expect(again.body.farmerId).toBe(first);
    expect((await admin.from('farmers').select('id').eq('user_id', elena.id)).data).toHaveLength(1);
  });

  it('a second farm with its own id, owned by the same person', async () => {
    const made = await request(app).post('/api/farmers').set(as(elena)).send(onboarding('La vale', 4.5, crypto.randomUUID()));
    expect(made.status).toBe(201);
    second = made.body.farmerId;
    expect(second).not.toBe(first);
    const owners = await admin.from('farm_members').select('farmer_id, role').eq('user_id', elena.id).order('farmer_id');
    expect(owners.data?.map((m) => m.role)).toEqual(['owner', 'owner']);
  });
});

describe('the picker', () => {
  it('lists both farms, with their hectares, and the accountant’s farm with its role', async () => {
    await admin.from('farm_members').insert({ farmer_id: first, user_id: carla.id, role: 'accountant' });
    const mine = (await request(app).get('/api/farms').set(as(elena))).body;
    expect(mine.farms).toEqual(
      expect.arrayContaining([
        { id: first, name: 'La deal', county: 'TR', role: 'owner', areaAri: 1000 },
        { id: second, name: 'La vale', county: 'TR', role: 'owner', areaAri: 450 },
      ]),
    );
    expect(mine.farms).toHaveLength(2);
    expect((await request(app).get('/api/farms').set(as(carla))).body.farms).toEqual([{ id: first, name: 'La deal', county: 'TR', role: 'accountant', areaAri: 1000 }]);
    expect((await request(app).get('/api/farms').set(as(sorin))).body).toEqual({ farms: [], lastFarmId: null });
  });

  it('remembers the farm opened last, and only a farm of mine', async () => {
    expect((await request(app).put('/api/profile/last-farm').set(as(elena)).send({ farmId: second })).status).toBe(204);
    expect((await request(app).get('/api/farms').set(as(elena))).body.lastFarmId).toBe(second);
    expect((await request(app).put('/api/profile/last-farm').set(as(sorin)).send({ farmId: second })).status).toBe(404);
  });
});

describe('switching: the data never mixes', () => {
  it('without naming a farm, the API asks which', async () => {
    expect((await request(app).get('/api/me').set(as(elena))).status).toBe(409);
  });

  it('each farm is itself: its name, its hectares, its money', async () => {
    const a = (await request(app).get('/api/me').set(as(elena, first))).body.farmer;
    const b = (await request(app).get('/api/me').set(as(elena, second))).body.farmer;
    expect([a.name, b.name]).toEqual(['La deal', 'La vale']);
    expect(a.parcels.map((p: { area_ari: number }) => p.area_ari)).toEqual([1000]);
    expect(b.parcels.map((p: { area_ari: number }) => p.area_ari)).toEqual([450]);
  });

  it('a sale noted on the second farm shows only there', async () => {
    const sale = await request(app).post('/api/sales').set(as(elena, second)).send({ cropId: 'grau', date: '2026-10-01', totalLei: 1234, clientId: crypto.randomUUID() });
    expect(sale.status).toBe(201);
    const sums = async (farm: string) =>
      ((await request(app).get('/api/me').set(as(elena, farm))).body.farmer.transactions as { amount_bani: number; kind: string }[]).filter((t) => t.kind === 'sale').map((t) => t.amount_bani);
    expect(await sums(second)).toEqual([123_400]);
    expect(await sums(first)).toEqual([]);
  });

  it('editing one farm leaves the other as it was', async () => {
    const res = await request(app).put('/api/farmers/me').set(as(elena, first)).send({ name: 'La deal', county: 'TR', age: 50, startBalanceLei: 10_000, parcels: [{ cropId: 'grau', areaHa: 12 }] });
    expect(res.status).toBe(200);
    const b = (await request(app).get('/api/me').set(as(elena, second))).body.farmer;
    expect(b.parcels.map((p: { area_ari: number }) => p.area_ari)).toEqual([450]);
  });
});
