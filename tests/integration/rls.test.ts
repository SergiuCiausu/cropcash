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

  it('a user cannot write money facts, even on their own farm', async () => {
    const stripeId = await a.client.from('farmers').update({ stripe_account_id: 'acct_fake' }).eq('id', farmA);
    expect(stripeId.error).not.toBeNull();
    const clock = await a.client.from('farmers').update({ demo_now: '2030-01-01T00:00:00Z' }).eq('id', farmA);
    expect(clock.error).not.toBeNull();
    const salary = await a.client.from('payouts').insert({ farmer_id: farmA, amount_bani: 100, scheduled_for: '2027-01-01' });
    expect(salary.error).not.toBeNull();
    const income = await a.client.from('transactions').insert({
      farmer_id: farmA,
      amount_bani: 100,
      occurred_at: new Date().toISOString(),
      source: 'stripe_transfer',
    });
    expect(income.error).not.toBeNull();
    const rpc = await a.client.rpc('apply_payout_paid', { p_stripe_payout: 'po_fake' });
    expect(rpc.error).not.toBeNull();
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
    expect(subs.body.totals.advanceLei).toBe(1264932);

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

  it('sale: raises the money the envelopes may use; undo takes it back', async () => {
    const auth = { Authorization: `Bearer ${b.token}` };
    const full = { salary: 65_000, spring_inputs: 3_435_000, debts: 0, risk_fund: 0, pension: 0 };
    const sale = await request(app).post('/api/sales').set(auth).send({ cropId: 'grau', date: '2026-10-01', totalLei: 1000 });
    expect(sale.status).toBe(201);
    const more = { ...full, risk_fund: 100_000 };
    expect((await request(app).put('/api/envelopes').set(auth).send(more)).status).toBe(204);
    await request(app).put('/api/envelopes').set(auth).send(full);
    expect((await request(app).delete(`/api/transactions/${sale.body.id}`).set(auth)).status).toBe(204);
    expect((await request(app).put('/api/envelopes').set(auth).send(more)).status).toBe(400);
  });

  it('expense: takes what the envelope has, and undo puts back exactly that', async () => {
    const auth = { Authorization: `Bearer ${b.token}` };
    const salary = async () => {
      const me = await request(app).get('/api/me').set(auth);
      return me.body.farmer.envelopes.find((e: { kind: string }) => e.kind === 'salary').balance_bani;
    };
    const res = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ category: 'repairs', amountLei: 1000, date: '2026-10-01', envelope: 'salary' });
    expect(res.status).toBe(201);
    expect(await salary()).toBe(0);
    expect((await request(app).delete(`/api/transactions/${res.body.id}`).set(auth)).status).toBe(204);
    expect(await salary()).toBe(65_000);
  });

  it("another user cannot see or undo someone else's records", async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const other = { Authorization: `Bearer ${a.token}` };
    const sale = await request(app).post('/api/sales').set(owner).send({ cropId: 'grau', date: '2026-10-01', totalLei: 500 });
    const { data } = await a.client.from('transactions').select('id').eq('id', sale.body.id);
    expect(data).toEqual([]);
    expect((await request(app).delete(`/api/transactions/${sale.body.id}`).set(other)).status).toBe(404);
    expect((await request(app).delete(`/api/transactions/${sale.body.id}`).set(owner)).status).toBe(204);
  });

  it("tasks: saved for the owner only, and another user can't write or reopen them", async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const other = { Authorization: `Bearer ${a.token}` };
    const path = `/api/tasks/${encodeURIComponent('apia-cerere:2027')}`;
    expect((await request(app).put(path).set(owner)).status).toBe(204);
    expect((await request(app).put(path).set(owner)).status).toBe(204);
    const me = await request(app).get('/api/me').set(owner);
    expect(me.body.farmer.task_completions).toEqual([{ task_id: 'apia-cerere:2027' }]);
    expect((await a.client.from('task_completions').select('task_id')).data).toEqual([]);
    expect((await request(app).delete(path).set(other)).status).toBe(404);
    const { data: farm } = await b.client.from('farmers').select('id').single();
    const { error } = await a.client.from('task_completions').insert({ farmer_id: farm!.id, task_id: 'apia-sold:2027' });
    expect(error).not.toBeNull();
    expect((await request(app).delete(path).set(owner)).status).toBe(204);
  });

  it('update_farm: replaces the parcels, and refuses money below the envelopes', async () => {
    const auth = { Authorization: `Bearer ${b.token}` };
    const edit = { name: 'Ion', county: 'TR', age: 56, parcels: [{ cropId: 'porumb', areaHa: 15 }] };
    const ok = await request(app).put('/api/farmers/me').set(auth).send({ ...edit, startBalanceLei: 35_000 });
    expect(ok.status).toBe(200);
    const me = await request(app).get('/api/me').set(auth);
    expect(me.body.farmer.parcels).toEqual([{ crop_id: 'porumb', area_ari: 1500, is_arable: true }]);
    const low = await request(app).put('/api/farmers/me').set(auth).send({ ...edit, startBalanceLei: 1 });
    expect(low.body.error).toBe('too_much');
    const after = await request(app).get('/api/me').set(auth);
    expect(after.body.farmer.start_balance_bani).toBe(3_500_000);
  });

  it('pension fund: saved for the owner only', async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    expect((await request(app).put('/api/pension/fund').set(owner).send({ fundId: 'stabil' })).status).toBe(204);
    const me = await request(app).get('/api/me').set(owner);
    expect(me.body.farmer.pension_fund_id).toBe('stabil');
    const { data: farm } = await b.client.from('farmers').select('id').single();
    await a.client.from('farmers').update({ pension_fund_id: 'nn-optim' }).eq('id', farm!.id);
    const after = await request(app).get('/api/me').set(owner);
    expect(after.body.farmer.pension_fund_id).toBe('stabil');
  });

  it('harvests: saved for the owner only', async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const harvests = {
      years: [{ year: 2027, status: 'open', openingBani: 100, parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }] }],
      gathered: [],
    };
    expect((await request(app).put('/api/farmers/me/harvests').set(owner).send(harvests)).status).toBe(200);
    const { data: farm } = await b.client.from('farmers').select('id').single();
    await a.client.from('farmers').update({ harvests: { years: [] } }).eq('id', farm!.id);
    const me = await request(app).get('/api/me').set(owner);
    expect(me.body.farmer.harvests).toEqual(harvests);
    const seen = await a.client.from('farmers').select('harvests').eq('id', farm!.id);
    expect(seen.data).toEqual([]);
  });

  it('planting month: kept when an edit does not send one', async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const edit = { name: 'Ion', county: 'TR', age: 55, startBalanceLei: 35_000 };
    const dated = await request(app).put('/api/farmers/me').set(owner)
      .send({ ...edit, parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }] });
    expect(dated.status).toBe(200);
    await request(app).put('/api/farmers/me').set(owner).send({ ...edit, parcels: [{ cropId: 'grau', areaHa: 9 }] });
    const me = await request(app).get('/api/me').set(owner);
    expect(me.body.farmer.parcels).toEqual([expect.objectContaining({ area_ari: 900, planted_month: '2026-10' })]);
  });

  it('harvest year: kept on sales and expenses', async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const date = new Date().toISOString().slice(0, 10);
    const sale = await request(app).post('/api/sales').set(owner).send({ cropId: 'grau', date, totalLei: 10, harvestYear: 2026 });
    const expense = await request(app).post('/api/expenses').set(owner)
      .send({ category: 'diesel', amountLei: 1, date, harvestYear: 2026 });
    expect([sale.status, expense.status]).toEqual([201, 201]);
    const me = await request(app).get('/api/me').set(owner);
    const year = (id: string) => me.body.farmer.transactions.find((t: { id: string }) => t.id === id)?.harvest_year;
    expect([year(sale.body.id), year(expense.body.id)]).toEqual([2026, 2026]);
    await request(app).delete(`/api/transactions/${sale.body.id}`).set(owner);
    await request(app).delete(`/api/transactions/${expense.body.id}`).set(owner);
  });

  it('a sale or expense sent twice with the same clientId is saved once (migration 017)', async () => {
    const owner = { Authorization: `Bearer ${b.token}` };
    const date = new Date().toISOString().slice(0, 10);
    const saleId = crypto.randomUUID();
    const expenseId = crypto.randomUUID();
    const sale = { cropId: 'grau', date, totalLei: 12, clientId: saleId };
    const expense = { category: 'diesel', amountLei: 3, date, clientId: expenseId };
    const [s1, s2] = [await request(app).post('/api/sales').set(owner).send(sale), await request(app).post('/api/sales').set(owner).send(sale)];
    const [e1, e2] = [await request(app).post('/api/expenses').set(owner).send(expense), await request(app).post('/api/expenses').set(owner).send(expense)];
    expect([s1.status, s2.status, e1.status, e2.status]).toEqual([201, 201, 201, 201]);
    expect(s2.body.id).toBe(s1.body.id);
    expect(e2.body.id).toBe(e1.body.id);
    const me = await request(app).get('/api/me').set(owner);
    const ids = me.body.farmer.transactions.map((t: { id: string }) => t.id);
    expect(ids.filter((id: string) => id === s1.body.id || id === e1.body.id)).toHaveLength(2);
    await request(app).delete(`/api/transactions/${s1.body.id}`).set(owner);
    await request(app).delete(`/api/transactions/${e1.body.id}`).set(owner);
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
