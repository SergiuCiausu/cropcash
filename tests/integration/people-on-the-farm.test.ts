/* People on the farm (migration 040, docs/workspaces-plan.md step 6), on the real Supabase: invites for every role,
   who may remove whom, role changes, the payroll link, handing the farm over, the owner's own money, and the grants
   that were swept. Run with `npm run test:integration` after `npm run db:migrate`. */
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
const anon = createClient(url, anonKey, noSession);
const stamp = Date.now();
const password = `Test-${stamp}-pw`;

interface TestUser {
  id: string;
  email: string;
  token: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `people-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, token: s.session!.access_token, client };
}

const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({ corsOrigins: ['http://localhost:5173'], verifyToken: supabaseTokenVerifier(url), repo: supabaseRepo(db()), members: supabaseMembers(db()), data: loadData(), getRates: async () => null });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}`, 'X-Farm-Id': farmId });

let owner: TestUser, manager: TestUser, manager2: TestUser, worker: TestUser, other: TestUser;
let farmId: string;
let otherFarm: string;
let nelu: string;

/** `who` joins the farm by a link `by` made for `role`, through the API as the phone does. */
async function join(who: TestUser, role: string, by: TestUser = owner) {
  const made = await request(app()).post('/api/farm/invites').set(as(by)).send({ role });
  expect(made.status, `${role} invite by ${by.email}`).toBe(201);
  const code = new URL(made.body.link).searchParams.get('cod');
  return request(app()).post('/api/invites/accept').set({ Authorization: `Bearer ${who.token}` }).send({ code });
}
const memberId = async (u: TestUser) => (await admin.from('farm_members').select('id').eq('farmer_id', farmId).eq('user_id', u.id).single()).data!.id as string;
const roleOf = async (u: TestUser) => (await admin.from('farm_members').select('role').eq('farmer_id', farmId).eq('user_id', u.id).maybeSingle()).data?.role ?? null;

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [owner, manager, manager2, worker, other] = await Promise.all(['owner', 'manager', 'manager2', 'worker', 'other'].map(makeUser));
  const mine = await owner.client.from('farmers').insert({ user_id: owner.id, name: 'Ferma Oameni', birth_year: 1968, county: 'TR' }).select('id').single();
  if (mine.error) throw mine.error;
  farmId = mine.data.id;
  const theirs = await other.client.from('farmers').insert({ user_id: other.id, name: 'Altă fermă', birth_year: 1970, county: 'OT' }).select('id').single();
  if (theirs.error) throw theirs.error;
  otherFarm = theirs.data.id;
  const person = await admin
    .from('employees')
    .insert({ farmer_id: farmId, name: 'Nelu', kind: 'permanent', cost_bani: 750_000, pay_basis: 'month', starts_on: '2026-01-01' })
    .select('id')
    .single();
  if (person.error) throw person.error;
  nelu = person.data.id;
  const money = await Promise.all([
    admin.from('pension_plans').insert({ farmer_id: farmId, monthly_bani: 50_000, vehicle: 'pilon3', started_at: '2026-01-01' }),
    admin.from('payouts').insert({ farmer_id: farmId, amount_bani: 300_000, scheduled_for: '2026-12-01' }),
  ]);
  for (const r of money) if (r.error) throw r.error;
});

afterAll(async () => {
  await Promise.all([owner, manager, manager2, worker, other].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('joining by a link, any role but owner', () => {
  it('a worker joins by the owner’s link, and reaches neither the farm’s tables nor its people', async () => {
    const res = await join(worker, 'worker');
    expect(res.body).toEqual({ farmerId: farmId, farmName: 'Ferma Oameni', role: 'worker' });
    expect((await request(app()).get('/api/farm/members').set(as(worker))).status).toBe(404);
    // RLS: only their own row of the farm's people, nothing of its money or plan.
    expect((await worker.client.from('farm_members').select('user_id').eq('farmer_id', farmId)).data).toEqual([{ user_id: worker.id }]);
    for (const t of ['farmers', 'transactions', 'employees', 'pension_plans', 'farm_invites']) {
      expect((await worker.client.from(t).select('*').eq(t === 'farmers' ? 'id' : 'farmer_id', farmId)).data ?? [], t).toEqual([]);
    }
    // And the picker shows the farm, with the role.
    expect((await request(app()).get('/api/farms').set({ Authorization: `Bearer ${worker.token}` })).body.farms).toEqual([expect.objectContaining({ id: farmId, role: 'worker' })]);
  });

  it('a manager joins, sees the people, invites a worker but never another manager (W4)', async () => {
    expect((await join(manager, 'manager')).body.role).toBe('manager');
    const list = await request(app()).get('/api/farm/members').set(as(manager));
    expect(list.body).toMatchObject({ myRole: 'manager', manages: ['worker', 'accountant', 'viewer'] });
    expect(list.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'manager', 'worker']);
    expect((await request(app()).post('/api/farm/invites').set(as(manager)).send({ role: 'manager' })).status).toBe(403);
    // The database refuses it too, past the API.
    const direct = await manager.client.from('farm_invites').insert({ farmer_id: farmId, role: 'manager', token_hash: 'a'.repeat(64), expires_at: '2030-01-01T00:00:00Z' });
    expect(direct.error).not.toBeNull();
    const ok = await manager.client.from('farm_invites').insert({ farmer_id: farmId, role: 'worker', token_hash: 'b'.repeat(64), expires_at: '2030-01-01T00:00:00Z' }).select('invited_by').single();
    expect(ok.error).toBeNull();
    expect(ok.data!.invited_by).toBe(manager.id);
  });

  it('a link never demotes someone already on the farm, and the owner still hears it’s their own farm', async () => {
    expect((await join(manager, 'viewer')).body.role).toBe('manager');
    expect(await roleOf(manager)).toBe('manager');
    expect((await join(owner, 'worker')).body).toEqual({ error: 'own_farm' });
  });
});

describe('changing people', () => {
  it('a manager removes neither the owner nor another manager', async () => {
    expect((await join(manager2, 'manager')).body.role).toBe('manager');
    expect((await request(app()).delete(`/api/farm/members/${await memberId(owner)}`).set(as(manager))).status).toBe(404);
    expect((await request(app()).delete(`/api/farm/members/${await memberId(manager2)}`).set(as(manager))).status).toBe(404);
    expect(await roleOf(manager2)).toBe('manager');
  });

  it('only the owner changes a role, never their own', async () => {
    const id = await memberId(worker);
    expect((await request(app()).patch(`/api/farm/members/${id}`).set(as(manager)).send({ role: 'viewer' })).status).toBe(403);
    expect((await manager.client.rpc('set_member_role', { p_member: id, p_role: 'viewer' })).error?.hint).toBe('role_not_allowed');
    expect((await request(app()).patch(`/api/farm/members/${await memberId(owner)}`).set(as(owner)).send({ role: 'worker' })).body).toEqual({ error: 'is_owner' });
    expect((await request(app()).patch(`/api/farm/members/${id}`).set(as(owner)).send({ role: 'viewer' })).status).toBe(204);
    expect(await roleOf(worker)).toBe('viewer');
    expect((await request(app()).patch(`/api/farm/members/${id}`).set(as(owner)).send({ role: 'worker' })).status).toBe(204);
  });

  it('links an account to one person on the payroll, of this farm only', async () => {
    const w = await memberId(worker);
    expect((await request(app()).patch(`/api/farm/members/${w}`).set(as(owner)).send({ employeeId: nelu })).status).toBe(204);
    expect((await request(app()).patch(`/api/farm/members/${await memberId(manager2)}`).set(as(owner)).send({ employeeId: nelu })).body).toEqual({ error: 'employee_taken' });
    const elsewhere = await admin
      .from('employees')
      .insert({ farmer_id: otherFarm, name: 'Vasile', kind: 'permanent', cost_bani: 100_000, pay_basis: 'month', starts_on: '2026-01-01' })
      .select('id')
      .single();
    expect((await request(app()).patch(`/api/farm/members/${w}`).set(as(owner)).send({ employeeId: elsewhere.data!.id })).status).toBe(404);
    const list = await request(app()).get('/api/farm/members').set(as(owner));
    expect(list.body.members.find((m: { id: string }) => m.id === w).employeeId).toBe(nelu);
  });

  it('a manager removes a worker', async () => {
    const id = await memberId(worker);
    await request(app()).patch(`/api/farm/members/${id}`).set(as(owner)).send({ employeeId: null });
    expect((await request(app()).delete(`/api/farm/members/${id}`).set(as(manager))).status).toBe(204);
    expect(await roleOf(worker)).toBeNull();
  });
});

describe('the owner’s own money stays the owner’s, in the database too', () => {
  it('a manager reads no pension and no payouts, the owner does', async () => {
    for (const t of ['pension_plans', 'payouts']) {
      expect((await manager.client.from(t).select('id').eq('farmer_id', farmId)).data, t).toEqual([]);
      expect((await owner.client.from(t).select('id').eq('farmer_id', farmId)).data, t).toHaveLength(1);
    }
  });
});

describe('the grants (plan §7)', () => {
  it('without a session, nothing of a farm; the public reference data still reads', async () => {
    for (const t of ['farmers', 'transactions', 'fuel_logs', 'plots', 'envelopes']) {
      const { data, error } = await anon.from(t).select('*').limit(1);
      expect(error !== null || (data ?? []).length === 0, t).toBe(true);
    }
    expect((await anon.from('siruta_units').select('*').limit(1)).error).toBeNull();
  });

  it('the owner can’t delete past the API what nothing in the app deletes', async () => {
    for (const t of ['fuel_logs', 'envelopes', 'landowners', 'lease_contracts', 'farmers']) {
      const { error } = await owner.client.from(t).delete().eq(t === 'farmers' ? 'id' : 'farmer_id', farmId);
      expect(error?.code, t).toBe('42501');
    }
    expect((await admin.from('farmers').select('id').eq('id', farmId)).data).toHaveLength(1);
  });

  it('nobody signed in writes the reference data', async () => {
    const { error } = await owner.client.from('opportunities').delete().eq('stable_key', 'none');
    expect(error?.code).toBe('42501');
  });
});

describe('handing the farm over', () => {
  it('goes only to a manager, by the owner, and the old owner stays on as a manager', async () => {
    const back = await join(worker, 'worker');
    expect(back.body.role).toBe('worker');
    expect((await request(app()).post('/api/farm/transfer').set(as(owner)).send({ memberId: await memberId(worker) })).body).toEqual({ error: 'not_manager' });
    expect((await request(app()).post('/api/farm/transfer').set(as(manager)).send({ memberId: await memberId(manager) })).status).toBe(403);
    expect((await request(app()).post('/api/farm/transfer').set(as(owner)).send({ memberId: await memberId(manager) })).status).toBe(204);
    expect([await roleOf(owner), await roleOf(manager)]).toEqual(['manager', 'owner']);
    expect((await admin.from('farmers').select('user_id').eq('id', farmId).single()).data!.user_id).toBe(manager.id);
    // The money follows the role: the new owner reads the pension, the old one no longer does.
    expect((await manager.client.from('pension_plans').select('id').eq('farmer_id', farmId)).data).toHaveLength(1);
    expect((await owner.client.from('pension_plans').select('id').eq('farmer_id', farmId)).data).toEqual([]);
    // And the old owner can't hand it over again.
    expect((await request(app()).post('/api/farm/transfer').set(as(owner)).send({ memberId: await memberId(owner) })).status).toBe(403);
  });
});
