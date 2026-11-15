/* The accountant's access (migration 028), on the real Supabase: a link, accepted once, read-only, and
   taken back. Run with `npm run test:integration` after `npm run db:migrate`. Sends no email: the
   invites here have no address. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseMembers } from '../../apps/api/src/db/members';
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
  const email = `members-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}

let farmer: TestUser;
let accountant: TestUser;
let stranger: TestUser;
let farmId: string;
const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({ corsOrigins: ['http://localhost:5173'], verifyToken: supabaseTokenVerifier(url), repo: supabaseRepo(db()), members: supabaseMembers(db()), data: loadData(), getRates: async () => null });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [farmer, accountant, stranger] = await Promise.all([makeUser('farmer'), makeUser('accountant'), makeUser('stranger')]);
  const { data, error } = await farmer.client.from('farmers').insert({ user_id: farmer.id, name: 'Ion Test', birth_year: 1970, county: 'TR' }).select('id').single();
  if (error) throw error;
  farmId = data.id;
  await farmer.client.from('parcels').insert({ farmer_id: farmId, crop_id: 'grau', area_ari: 800, is_arable: true });
});

afterAll(async () => {
  await Promise.all([farmer, accountant, stranger].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('the accountant’s access', () => {
  let code = '';

  it('the farmer makes a link; only its hash is stored', async () => {
    const res = await request(app()).post('/api/farm/invites').set(as(farmer)).send({ role: 'accountant' });
    expect(res.status).toBe(201);
    code = new URL(res.body.link).searchParams.get('cod')!;
    const { data } = await admin.from('farm_invites').select('token_hash').eq('farmer_id', farmId);
    expect(JSON.stringify(data)).not.toContain(code);
  });

  it('the accountant accepts it, once; nobody else can after', async () => {
    const ok = await request(app()).post('/api/invites/accept').set(as(accountant)).send({ code });
    expect(ok.body).toMatchObject({ farmerId: farmId, farmName: 'Ion Test', role: 'accountant' });
    const again = await request(app()).post('/api/invites/accept').set(as(stranger)).send({ code });
    expect(again.body).toEqual({ error: 'used' });
  });

  it('reads the farm through the API, never the tables directly', async () => {
    const res = await request(app()).get(`/api/memberships/${farmId}`).set(as(accountant));
    expect(res.status).toBe(200);
    expect(res.body.farmer.name).toBe('Ion Test');
    expect(res.body.farmer).not.toHaveProperty('stripe_account_id');
    for (const table of ['farmers', 'transactions', 'parcels', 'plots', 'farm_invites']) {
      const { data } = await accountant.client.from(table).select('*').eq(table === 'farmers' ? 'id' : 'farmer_id', farmId);
      expect(data ?? [], table).toEqual([]);
    }
    expect((await request(app()).get(`/api/memberships/${farmId}`).set(as(stranger))).status).toBe(404);
  });

  it('can’t write to the farm, nor add anyone', async () => {
    expect((await request(app()).post('/api/sales').set(as(accountant)).send({ cropId: 'grau', date: '2026-10-01', totalLei: 10 })).status).toBe(404);
    const self = await accountant.client.from('farm_members').insert({ farmer_id: farmId, user_id: stranger.id, role: 'viewer' });
    expect(self.error).not.toBeNull();
  });

  it('the farmer sees them and takes the access back', async () => {
    const list = (await request(app()).get('/api/farm/members').set(as(farmer))).body;
    expect(list.members).toEqual([expect.objectContaining({ role: 'accountant', email: `members-accountant-${stamp}@cropcash.test` })]);
    expect((await request(app()).delete(`/api/farm/members/${list.members[0].id}`).set(as(farmer))).status).toBe(204);
    expect((await request(app()).get(`/api/memberships/${farmId}`).set(as(accountant))).status).toBe(404);
  });
});
