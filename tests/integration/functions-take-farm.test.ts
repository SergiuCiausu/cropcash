/* The SQL functions are told the farm and check the role (migration 036, docs/workspaces-plan.md step 2), on the
   real Supabase. Run with `npm run test:integration` after `npm run db:migrate`. The old one-farm signatures went in
   step 8 (043); the last describe checks they're gone.

   The cast: Ana owns farm A. Bogdan owns farm B and is a manager on A (so he has two farms). Wally is a worker on
   A, Carla its accountant, Sorin has no farm at all. Memberships other than owner are put in with the service
   key: invites for these roles come in step 6. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now();
const password = `Test-${stamp}-pw`;

interface TestUser {
  id: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `fnfarm-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, client };
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

let ana: TestUser, bogdan: TestUser, wally: TestUser, carla: TestUser, sorin: TestUser;
let farmA: string, farmB: string;

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [ana, bogdan, wally, carla, sorin] = await Promise.all(['ana', 'bogdan', 'wally', 'carla', 'sorin'].map(makeUser));
  [farmA, farmB] = await Promise.all([makeFarm(ana, 'Ferma A'), makeFarm(bogdan, 'Ferma B')]);
  const { error } = await admin.from('farm_members').insert([
    { farmer_id: farmA, user_id: bogdan.id, role: 'manager' },
    { farmer_id: farmA, user_id: wally.id, role: 'worker' },
    { farmer_id: farmA, user_id: carla.id, role: 'accountant' },
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([ana, bogdan, wally, carla, sorin].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

/* One call per function, on the given farm, as the given person. */
const calls = {
  set_envelopes: (u: TestUser, farm: string) => u.client.rpc('set_envelopes', { p_farmer_id: farm, p_balances: { salary: 1000 } }),
  record_expense: (u: TestUser, farm: string) =>
    u.client.rpc('record_expense', { p_farmer_id: farm, p_amount_bani: 500, p_date: '2026-10-01', p_category: 'fuel', p_crop_id: null, p_note: `test ${u.id}`, p_envelope: null }),
  update_farm: (u: TestUser, farm: string) =>
    u.client.rpc('update_farm', { p_farmer_id: farm, p_name: farm === farmA ? 'Ferma A' : 'Ferma B', p_county: 'TR', p_birth_year: 1970, p_parcels: [{ crop_id: 'grau', area_ari: 800 }], p_start_balance_bani: 1_000_000 }),
  save_plots: (u: TestUser, farm: string) =>
    u.client.rpc('save_plots', { p_farmer_id: farm, p_harvest_year: 2031, p_plots: [{ name: `Tarla ${u.id.slice(0, 6)}`, season: { crop_id: 'grau', area_ari: 10 } }] }),
} as const;

describe.each(Object.entries(calls))('%s(p_farmer_id, …)', (_name, call) => {
  it('the owner may', async () => {
    expect((await call(ana, farmA)).error).toBeNull();
  });

  it('a manager may, on the farm they manage', async () => {
    expect((await call(bogdan, farmA)).error).toBeNull();
  });

  it('a worker and an accountant may not', async () => {
    expect((await call(wally, farmA)).error).toMatchObject({ code: '42501', hint: 'role_not_allowed' });
    expect((await call(carla, farmA)).error).toMatchObject({ code: '42501', hint: 'role_not_allowed' });
  });

  it('nobody acts on a farm they aren’t part of', async () => {
    expect((await call(sorin, farmA)).error).toMatchObject({ code: '42501', hint: 'not_a_member' });
    expect((await call(ana, farmB)).error).toMatchObject({ code: '42501', hint: 'not_a_member' });
  });
});

describe('the farm named is the farm written', () => {
  it('Bogdan’s expense on A lands on A, not on his own farm', async () => {
    const { data: id, error } = await bogdan.client.rpc('record_expense', {
      p_farmer_id: farmA, p_amount_bani: 700, p_date: '2026-10-02', p_category: 'fuel', p_crop_id: null, p_note: 'pe A', p_envelope: null,
    });
    expect(error).toBeNull();
    const { data } = await admin.from('transactions').select('farmer_id').eq('id', id as string).single();
    expect(data).toEqual({ farmer_id: farmA });
  });

  it('a manager reads the farm’s tables; a worker and an accountant still don’t', async () => {
    expect((await bogdan.client.from('transactions').select('id').eq('farmer_id', farmA)).data?.length).toBeGreaterThan(0);
    expect((await bogdan.client.from('farmers').select('id').eq('id', farmA)).data).toEqual([{ id: farmA }]);
    for (const u of [wally, carla]) {
      expect((await u.client.from('transactions').select('id').eq('farmer_id', farmA)).data).toEqual([]);
      expect((await u.client.from('farmers').select('id').eq('id', farmA)).data).toEqual([]);
    }
  });
});

describe('the old signatures, gone in step 8 (migration 043)', () => {
  it('a call without the farm finds no function, whoever makes it', async () => {
    const calls = [
      ana.client.rpc('record_expense', { p_amount_bani: 300, p_date: '2026-10-03', p_category: 'fuel', p_crop_id: null, p_note: 'fără fermă', p_envelope: null }),
      ana.client.rpc('set_envelopes', { p_balances: { salary: 2000 } }),
      ana.client.rpc('save_plots', { p_harvest_year: 2031, p_plots: [{ name: 'Veche', season: { crop_id: 'grau', area_ari: 5 } }] }),
      ana.client.rpc('update_farm', { p_name: 'Ferma A', p_county: 'TR', p_birth_year: 1970, p_parcels: [{ crop_id: 'grau', area_ari: 800 }], p_start_balance_bani: 1_000_000 }),
      bogdan.client.rpc('set_envelopes', { p_balances: { salary: 1000 } }),
      ana.client.rpc('only_farm'),
    ];
    for (const r of await Promise.all(calls)) expect(r.error?.code).toBe('PGRST202');
  });
});
