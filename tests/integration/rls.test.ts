import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  client: SupabaseClient;
}

async function makeUser(tag: string): Promise<TestUser> {
  const email = `rls-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}

let a: TestUser;
let b: TestUser;
let farmA: string;

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [a, b] = await Promise.all([makeUser('a'), makeUser('b')]);
});

afterAll(async () => {
  // Deleting auth users cascades to farmers and all child rows.
  await Promise.all([a, b].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('Row Level Security', () => {
  it('a user can create their own farm', async () => {
    const { data, error } = await a.client
      .from('farmers')
      .insert({ user_id: a.id, name: 'Ion Test', birth_year: 1970, county: 'Teleorman' })
      .select('id')
      .single();
    expect(error).toBeNull();
    farmA = data!.id;
  });

  it("a user cannot create a farm on someone else's account", async () => {
    const { error } = await a.client
      .from('farmers')
      .insert({ user_id: b.id, name: 'Intrus', birth_year: 1970, county: 'Ilfov' });
    expect(error).not.toBeNull();
  });

  it('a user can add parcels to their own farm', async () => {
    const { error } = await a.client.from('parcels').insert({ farmer_id: farmA, crop_id: 'grau', area_ari: 800 });
    expect(error).toBeNull();
  });

  it("another user sees none of A's data", async () => {
    const farms = await b.client.from('farmers').select('*');
    const parcels = await b.client.from('parcels').select('*');
    expect(farms.data).toEqual([]);
    expect(parcels.data).toEqual([]);
  });

  it("another user cannot write into A's farm", async () => {
    const { error } = await b.client.from('parcels').insert({ farmer_id: farmA, crop_id: 'porumb', area_ari: 700 });
    expect(error).not.toBeNull();
    const upd = await b.client.from('farmers').update({ name: 'Hacked' }).eq('id', farmA).select();
    expect(upd.data).toEqual([]);
  });

  it('anonymous requests see nothing', async () => {
    const anon = createClient(url, anonKey, noSession);
    const { data } = await anon.from('farmers').select('*');
    expect(data ?? []).toEqual([]);
  });
});

describe('API with real Supabase tokens', () => {
  const app = createApp({
    corsOrigins: ['http://localhost:5173'],
    verifyToken: supabaseTokenVerifier(url),
    repo: supabaseRepo(supabaseFactory(url, anonKey, serviceKey)),
    data: loadData(),
  });

  it('GET /api/me returns only the caller’s farm', async () => {
    const resA = await request(app).get('/api/me').set('Authorization', `Bearer ${a.token}`);
    expect(resA.status).toBe(200);
    expect(resA.body).toMatchObject({ userId: a.id, farmer: { id: farmA, name: 'Ion Test' } });

    const resB = await request(app).get('/api/me').set('Authorization', `Bearer ${b.token}`);
    expect(resB.status).toBe(200);
    expect(resB.body).toEqual({ userId: b.id, farmer: null });
  });

  it('onboarding via POST /api/farmers creates farm, parcels and 5 envelopes', async () => {
    const ion = {
      name: 'Ion',
      county: 'TR',
      age: 55,
      startBalanceLei: 35000,
      parcels: [
        { cropId: 'grau', areaHa: 8 },
        { cropId: 'porumb', areaHa: 7 },
      ],
    };
    const res = await request(app).post('/api/farmers').set('Authorization', `Bearer ${b.token}`).send(ion);
    expect(res.status).toBe(201);
    expect(res.body.subsidies.totals.eur.probable).toBe(319500);

    const envelopes = await b.client.from('envelopes').select('kind, balance_bani');
    expect(envelopes.data?.map((e) => e.kind).sort()).toEqual(
      ['pension', 'risk_fund', 'salary', 'spring_inputs', 'debts'].sort(),
    );
    const parcels = await b.client.from('parcels').select('crop_id, area_ari');
    expect(parcels.data).toHaveLength(2);

    const again = await request(app).post('/api/farmers').set('Authorization', `Bearer ${b.token}`).send(ion);
    expect(again.status).toBe(409);

    const subs = await request(app).get('/api/subsidies').set('Authorization', `Bearer ${b.token}`);
    expect(subs.body.totals.advanceLei).toBe(1265220);

    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${b.token}`);
    expect(me.body.farmer.start_balance_bani).toBe(3_500_000);
  });

  it('credits: declare, read back in /api/me, other user cannot delete, owner deletes', async () => {
    const auth = { Authorization: `Bearer ${b.token}` };
    const res = await request(app)
      .post('/api/credits')
      .set(auth)
      .send({ amountLei: 14800, takeMonth: '2027-04', repayMonth: '2027-11' });
    expect(res.status).toBe(201);
    const groupId = res.body.groupId as string;

    const me = await request(app).get('/api/me').set(auth);
    const rows = me.body.farmer.expected_payments.filter((p: { group_id: string }) => p.group_id === groupId);
    expect(rows.map((r: { kind: string }) => r.kind).sort()).toEqual(['credit', 'loan_repayment']);

    const intruder = await request(app).delete(`/api/credits/${groupId}`).set('Authorization', `Bearer ${a.token}`);
    expect(intruder.status).toBe(404);

    const del = await request(app).delete(`/api/credits/${groupId}`).set(auth);
    expect(del.status).toBe(204);
  });

  it('envelopes: split saved; more than the money on hand is refused by the database', async () => {
    const auth = { Authorization: `Bearer ${b.token}` };
    const ok = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, risk_fund: 0, pension: 0 };
    expect((await request(app).put('/api/envelopes').set(auth).send(ok)).status).toBe(204);
    const me = await request(app).get('/api/me').set(auth);
    const salary = me.body.farmer.envelopes.find((e: { kind: string }) => e.kind === 'salary');
    expect(salary.balance_bani).toBe(65_000);

    const tooMuch = { ...ok, risk_fund: 1 };
    const res = await request(app).put('/api/envelopes').set(auth).send(tooMuch);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_much');
  });

  it("onboarding data stays invisible to other users", async () => {
    const env = await a.client.from('envelopes').select('farmer_id');
    expect(env.data?.every((e) => e.farmer_id === farmA)).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const [h, p, s] = a.token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = [h, Buffer.from(JSON.stringify({ ...payload, sub: b.id })).toString('base64url'), s].join('.');
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});
