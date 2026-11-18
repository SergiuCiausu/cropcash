/* The API acts on the farm the request names (docs/workspaces-plan.md step 3), on the real Supabase.
   Run with `npm run test:integration` after `npm run db:migrate`.

   Ana owns farm A. Bogdan owns farm B and manages A (put in with the service key: manager invites are step 6).
   Sorin has no farm. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseMembers } from '../../apps/api/src/db/members';
import { supabasePlots } from '../../apps/api/src/db/plots';
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
  const email = `farmchoice-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}
async function makeFarm(u: TestUser, name: string): Promise<string> {
  const { data, error } = await u.client.rpc('create_farm', {
    p_name: name,
    p_county: 'TR',
    p_birth_year: 1970,
    p_parcels: [{ crop_id: 'grau', area_ari: 800 }],
    p_start_balance_bani: 1_000_000,
  });
  if (error) throw error;
  return data as string;
}

let ana: TestUser, bogdan: TestUser, sorin: TestUser;
let farmA: string, farmB: string;
const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({
    corsOrigins: ['http://localhost:5173'],
    verifyToken: supabaseTokenVerifier(url),
    repo: supabaseRepo(db()),
    members: supabaseMembers(db()),
    plots: supabasePlots(db()),
    data: loadData(),
    getRates: async () => null,
  });
const as = (u: TestUser, farm?: string) => ({ Authorization: `Bearer ${u.token}`, ...(farm ? { 'X-Farm-Id': farm } : {}) });

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [ana, bogdan, sorin] = await Promise.all(['ana', 'bogdan', 'sorin'].map(makeUser));
  [farmA, farmB] = await Promise.all([makeFarm(ana, 'Ferma A'), makeFarm(bogdan, 'Ferma B')]);
  await admin.from('farmers').update({ stripe_account_id: `acct_test_${stamp}` }).eq('id', farmA);
  const { error } = await admin.from('farm_members').insert({ farmer_id: farmA, user_id: bogdan.id, role: 'manager' });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([ana, bogdan, sorin].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('which farm (X-Farm-Id)', () => {
  it('someone with one farm needs no header, as before', async () => {
    const me = (await request(app()).get('/api/me').set(as(ana))).body;
    expect(me).toMatchObject({ role: 'owner', farmer: { id: farmA, stripe_account_id: `acct_test_${stamp}` } });
  });

  it('someone with two is asked which, never guessed for', async () => {
    const res = await request(app()).get('/api/me').set(as(bogdan));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'farm_required' });
  });

  it('the owner’s view of B, the manager’s view of A', async () => {
    expect((await request(app()).get('/api/me').set(as(bogdan, farmB))).body).toMatchObject({ role: 'owner', farmer: { id: farmB } });
    const managed = (await request(app()).get('/api/me').set(as(bogdan, farmA))).body;
    expect(managed).toMatchObject({ role: 'manager', farmer: { id: farmA, stripe_account_id: null, pension_plans: [], payouts: [] } });
  });

  it('a farm that isn’t mine is no farm at all', async () => {
    expect((await request(app()).get('/api/me').set(as(sorin, farmA))).body).toMatchObject({ farmer: null, role: null });
    expect((await request(app()).get('/api/subsidies').set(as(ana, farmB))).status).toBe(404);
    const sale = await request(app()).post('/api/sales').set(as(sorin, farmA)).send({ cropId: 'grau', date: '2026-10-01', totalLei: 10 });
    expect(sale.status).toBe(404);
  });
});

describe('writes land on the farm named', () => {
  it('an expense through the API goes to A when A is named', async () => {
    const res = await request(app()).post('/api/expenses').set(as(bogdan, farmA)).send({ category: 'other', amountLei: 7, date: '2026-10-01', note: `pe A ${stamp}` });
    expect(res.status).toBe(201);
    const { data } = await admin.from('transactions').select('farmer_id').eq('id', res.body.id).single();
    expect(data).toEqual({ farmer_id: farmA });
  });

  it('a task done on both farms and reopened on one stays done on the other', async () => {
    const path = `/api/tasks/${encodeURIComponent('apia-cerere:2027')}`;
    expect((await request(app()).put(path).set(as(bogdan, farmA))).status).toBe(204);
    expect((await request(app()).put(path).set(as(bogdan, farmB))).status).toBe(204);
    expect((await request(app()).delete(path).set(as(bogdan, farmB))).status).toBe(204);
    const left = await admin.from('task_completions').select('farmer_id').eq('task_id', 'apia-cerere:2027').in('farmer_id', [farmA, farmB]);
    expect(left.data).toEqual([{ farmer_id: farmA }]);
  });

  it('the map lists only the farm named', async () => {
    const own = await admin.from('plots').select('id').eq('farmer_id', farmA);
    const res = await request(app()).get('/api/plots').set(as(bogdan, farmA));
    expect(res.status).toBe(200);
    expect((res.body.plots as { id: string }[]).map((p) => p.id).sort()).toEqual((own.data ?? []).map((p) => p.id).sort());
  });
});

describe('people: the owner and the managers (step 6)', () => {
  it('the owner and the manager list A’s people, owner first', async () => {
    const list = await request(app()).get('/api/farm/members').set(as(ana, farmA));
    expect(list.status).toBe(200);
    expect(list.body.members).toEqual([expect.objectContaining({ role: 'owner', you: true }), expect.objectContaining({ role: 'manager', you: false })]);
    const seen = await request(app()).get('/api/farm/members').set(as(bogdan, farmA));
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ myRole: 'manager', manages: ['worker', 'accountant', 'viewer'] });
  });
});
