/* Which excise schemes the farm joined (migration 052, docs/accize-plan.md step 2), on the real Supabase: owner and
   manager write, the accountant only reads, a worker and another farm see nothing; a row is never deleted; the
   acord day only goes with an acord. Run with `npm run test:integration` after `npm run db:migrate`. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../../apps/api/src/app';
import { supabaseFactory } from '../../apps/api/src/db/supabase';
import { supabaseRepo } from '../../apps/api/src/db/repo';
import { supabaseExcise } from '../../apps/api/src/db/excise';
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
  const email = `excise-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}

const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({ corsOrigins: [], verifyToken: supabaseTokenVerifier(url), repo: supabaseRepo(db()), excise: supabaseExcise(db()), data: loadData(), getRates: async () => null });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

let owner: TestUser, manager: TestUser, accountant: TestUser, worker: TestUser, other: TestUser;
let farmId: string, otherFarm: string;

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [owner, manager, accountant, worker, other] = await Promise.all(['owner', 'manager', 'accountant', 'worker', 'other'].map(makeUser));
  const mine = await owner.client.from('farmers').insert({ user_id: owner.id, name: 'Ferma Accize', birth_year: 1968, county: 'TR' }).select('id').single();
  if (mine.error) throw mine.error;
  farmId = mine.data.id;
  const theirs = await other.client.from('farmers').insert({ user_id: other.id, name: 'Altă fermă', birth_year: 1970, county: 'OT' }).select('id').single();
  if (theirs.error) throw theirs.error;
  otherFarm = theirs.data.id;
  const joined = await admin.from('farm_members').insert([
    { farmer_id: farmId, user_id: manager.id, role: 'manager', invited_by: owner.id },
    { farmer_id: farmId, user_id: accountant.id, role: 'accountant', invited_by: owner.id },
    { farmer_id: farmId, user_id: worker.id, role: 'worker', invited_by: owner.id },
  ]);
  if (joined.error) throw joined.error;
}, 60_000);

afterAll(async () => {
  await admin.from('farmers').delete().in('id', [farmId, otherFarm].filter(Boolean));
  await Promise.all([owner, manager, accountant, worker, other].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
}, 60_000);

describe('farm_excise_schemes through the API', () => {
  it('saves the owner\'s acord and lets the manager change it', async () => {
    const put = await request(app()).put('/api/excise/motorina-hg1174/2026').set(as(owner)).send({ status: 'acord_filed', acordOn: '2025-12-19' });
    expect(put.status).toBe(200);
    expect(put.body.enrollment).toMatchObject({ schemeId: 'motorina-hg1174', year: 2026, status: 'acord_filed', acordOn: '2025-12-19' });

    const approved = await request(app()).put('/api/excise/motorina-hg1174/2026').set(as(manager)).send({ status: 'approved', acordOn: '2025-12-19' });
    expect(approved.status).toBe(200);

    const list = await request(app()).get('/api/excise').set(as(owner));
    expect(list.body.enrollments).toEqual([expect.objectContaining({ schemeId: 'motorina-hg1174', year: 2026, status: 'approved' })]);
  });

  it('lets the other farm keep its own rows, apart', async () => {
    const put = await request(app()).put('/api/excise/motorina-pompa-2027/2027').set(as(other)).send({ status: 'interested' });
    expect(put.status).toBe(200);
    const mine = await request(app()).get('/api/excise').set(as(owner));
    expect(mine.body.enrollments.map((e: { schemeId: string }) => e.schemeId)).toEqual(['motorina-hg1174']);
  });
});

describe('farm_excise_schemes RLS, straight to the database', () => {
  it('shows the accountant the rows but refuses their writes', async () => {
    const read = await accountant.client.from('farm_excise_schemes').select('scheme_id').eq('farmer_id', farmId);
    expect(read.data).toHaveLength(1);
    const write = await accountant.client.from('farm_excise_schemes').insert({ farmer_id: farmId, scheme_id: 'tuica-gospodarie', year: 2026 });
    expect(write.error?.code).toBe('42501');
  });

  it('shows a worker and another farm nothing, and lets no one write into a farm that isn\'t theirs', async () => {
    for (const u of [worker, other]) {
      const read = await u.client.from('farm_excise_schemes').select('scheme_id').eq('farmer_id', farmId);
      expect(read.data).toEqual([]);
    }
    const write = await other.client.from('farm_excise_schemes').insert({ farmer_id: farmId, scheme_id: 'tuica-gospodarie', year: 2026 });
    expect(write.error?.code).toBe('42501');
  });

  it('never deletes a row past the service key', async () => {
    await owner.client.from('farm_excise_schemes').delete().eq('farmer_id', farmId);
    const still = await admin.from('farm_excise_schemes').select('scheme_id').eq('farmer_id', farmId);
    expect(still.data).toHaveLength(1);
  });

  it('keeps the acord day only with an acord, and stamps updated_at itself', async () => {
    const bad = await owner.client.from('farm_excise_schemes').insert({ farmer_id: farmId, scheme_id: 'tuica-gospodarie', year: 2026, status: 'interested', acord_on: '2026-01-05' });
    expect(bad.error?.code).toBe('23514');
    // Leaving with the acord day still on breaks the check: leaving has to clear it (the API always does).
    const keepsDay = await owner.client.from('farm_excise_schemes').update({ status: 'left' }).eq('farmer_id', farmId).eq('scheme_id', 'motorina-hg1174');
    expect(keepsDay.error?.code).toBe('23514');
    const stale = await owner.client
      .from('farm_excise_schemes')
      .update({ status: 'left', acord_on: null, updated_at: '2000-01-01T00:00:00Z' })
      .eq('farmer_id', farmId)
      .eq('scheme_id', 'motorina-hg1174')
      .select('updated_at')
      .single();
    expect(stale.error).toBeNull();
    expect(stale.data!.updated_at.startsWith('2000')).toBe(false);
  });
});
