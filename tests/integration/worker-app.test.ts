/* The worker's app (migration 042, docs/workspaces-plan.md step 7), on the real Supabase: a worker reads the parcels
   and their work, finishes their own or anyone's work but not someone else's, notes diesel once per tap, sees only
   their own diesel, and reads no money. created_by is stamped by the database, not by the caller.
   Run with `npm run test:integration` after `npm run db:migrate` (040 and 042). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseMembers } from '../../apps/api/src/db/members';
import { supabaseWorker } from '../../apps/api/src/db/worker';
import { loadData, wireHasMoney } from '../../packages/shared/src';
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
  email: string;
  token: string;
  client: SupabaseClient;
}
async function makeUser(tag: string): Promise<TestUser> {
  const email = `worker-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, token: s.session!.access_token, client };
}

const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({
    corsOrigins: ['http://localhost:5173'],
    verifyToken: supabaseTokenVerifier(url),
    repo: supabaseRepo(db()),
    members: supabaseMembers(db()),
    worker: supabaseWorker(db()),
    data: loadData(),
    getRates: async () => null,
  });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}`, 'X-Farm-Id': farmId });

let owner: TestUser, worker: TestUser, worker2: TestUser;
let farmId: string, plotId: string, nelu: string, vasile: string;
let opMine: string, opAny: string, opVasile: string;

async function join(who: TestUser) {
  const made = await request(app()).post('/api/farm/invites').set(as(owner)).send({ role: 'worker' });
  const code = new URL(made.body.link).searchParams.get('cod');
  const res = await request(app()).post('/api/invites/accept').set({ Authorization: `Bearer ${who.token}` }).send({ code });
  expect(res.status).toBe(200);
}
async function op(assigned: string | null) {
  const r = await admin
    .from('plot_operations')
    .insert({ plot_id: plotId, farmer_id: farmId, harvest_year: 2027, kind: 'herbicide', status: 'planned', on_date: '2026-11-20', assigned_to: assigned })
    .select('id')
    .single();
  if (r.error) throw r.error;
  return r.data.id as string;
}

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [owner, worker, worker2] = await Promise.all(['owner', 'nelu', 'vasile'].map(makeUser));
  const farm = await owner.client.from('farmers').insert({ user_id: owner.id, name: 'Ferma Lucru', birth_year: 1968, county: 'TR' }).select('id').single();
  if (farm.error) throw farm.error;
  farmId = farm.data.id;
  const plot = await admin.from('plots').insert({ farmer_id: farmId, name: 'La drum', county: 'TR' }).select('id').single();
  if (plot.error) throw plot.error;
  plotId = plot.data.id;
  const people = await admin
    .from('employees')
    .insert(['Nelu', 'Vasile'].map((name) => ({ farmer_id: farmId, name, kind: 'permanent', cost_bani: 700_000, pay_basis: 'month', starts_on: '2026-01-01' })))
    .select('id, name');
  if (people.error) throw people.error;
  nelu = people.data.find((p) => p.name === 'Nelu')!.id;
  vasile = people.data.find((p) => p.name === 'Vasile')!.id;
  await join(worker);
  await join(worker2);
  for (const [u, e] of [
    [worker, nelu],
    [worker2, vasile],
  ] as const) {
    const m = (await admin.from('farm_members').select('id').eq('farmer_id', farmId).eq('user_id', u.id).single()).data!.id;
    expect((await request(app()).patch(`/api/farm/members/${m}`).set(as(owner)).send({ employeeId: e })).status).toBe(204);
  }
  [opMine, opAny, opVasile] = await Promise.all([op(nelu), op(null), op(vasile)]);
  const money = await admin.from('transactions').insert({ farmer_id: farmId, amount_bani: 100_000, occurred_at: '2026-11-10T10:00:00Z', source: 'manual' });
  if (money.error) throw money.error;
});

afterAll(async () => {
  await Promise.all([owner, worker, worker2].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('the worker reads the field, not the money', () => {
  it('parcels and work, through RLS and through /api/worker, without a single amount', async () => {
    expect((await worker.client.from('plots').select('id').eq('farmer_id', farmId)).data).toEqual([{ id: plotId }]);
    expect((await worker.client.from('plot_operations').select('id').eq('farmer_id', farmId)).data).toHaveLength(3);
    for (const t of ['transactions', 'employees', 'farm_events', 'pension_plans']) {
      expect((await worker.client.from(t).select('*').eq('farmer_id', farmId)).data ?? [], t).toEqual([]);
    }
    const day = await request(app()).get('/api/worker').set(as(worker));
    expect(day.status).toBe(200);
    expect(day.body.work.map((w: { id: string }) => w.id)).toEqual([opMine, opAny]);
    expect(wireHasMoney(day.body)).toEqual([]);
  });
});

describe('„Am terminat”', () => {
  it('their own and anyone’s, not someone else’s; stamped with who did it', async () => {
    expect((await request(app()).post(`/api/worker/work/${opMine}/done`).set(as(worker)).send({ onDate: '2026-11-17' })).status).toBe(204);
    expect((await request(app()).post(`/api/worker/work/${opAny}/done`).set(as(worker)).send({ onDate: '2026-11-17' })).status).toBe(204);
    expect((await request(app()).post(`/api/worker/work/${opVasile}/done`).set(as(worker)).send({ onDate: '2026-11-17' })).status).toBe(404);
    const rows = (await admin.from('plot_operations').select('id, status, on_date').in('id', [opMine, opAny, opVasile])).data!;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [opMine]: 'done', [opAny]: 'done', [opVasile]: 'planned' });
    // Again: nothing changes, nothing breaks.
    expect((await request(app()).post(`/api/worker/work/${opMine}/done`).set(as(worker)).send({ onDate: '2026-11-17' })).status).toBe(204);
  });
});

describe('„Motorină”', () => {
  it('once per tap, each sees only their own, and the owner sees who noted what', async () => {
    const body = { onDate: '2026-11-17', liters: 85.5, plotId, clientId: randomUUID() };
    const first = await request(app()).post('/api/worker/fuel').set(as(worker)).send(body);
    expect(first.status).toBe(201);
    expect((await request(app()).post('/api/worker/fuel').set(as(worker)).send(body)).body).toEqual(first.body);
    await request(app()).post('/api/worker/fuel').set(as(worker2)).send({ ...body, liters: 10, clientId: randomUUID() });
    const mine = await worker.client.from('fuel_logs').select('id, created_by').eq('farmer_id', farmId);
    expect(mine.data).toEqual([{ id: first.body.id, created_by: worker.id }]);
    expect((await request(app()).get('/api/worker').set(as(worker))).body.fuel.map((f: { liters: number }) => f.liters)).toEqual([85.5]);
    const noted = await request(app()).get('/api/farm/noted').set(as(owner));
    expect(noted.body.noted.filter((n: { kind: string }) => n.kind === 'fuel')).toHaveLength(2);
    expect((await request(app()).get('/api/farm/noted').set(as(worker))).status).toBe(403);
  });

  it('created_by can’t be borrowed: the database writes who is signed in', async () => {
    const r = await worker.client.rpc('log_fuel', { p_farm: farmId, p_on: '2026-11-17', p_liters: 5, p_plot: null, p_note: null, p_client_id: randomUUID() });
    expect(r.error).toBeNull();
    const own = await owner.client.from('plot_operations').insert({ plot_id: plotId, farmer_id: farmId, harvest_year: 2027, kind: 'sowing', status: 'planned', created_by: worker.id }).select('created_by').single();
    expect(own.data?.created_by).toBe(owner.id);
  });
});
