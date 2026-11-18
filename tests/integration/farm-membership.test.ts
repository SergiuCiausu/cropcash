/* Membership is the access rule (migration 035, docs/workspaces-plan.md step 1), on the real Supabase.
   Run with `npm run test:integration` after `npm run db:migrate`. */
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
  const email = `workspace-${tag}-${stamp}@cropcash.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session!.access_token, client };
}

let owner: TestUser;
let stranger: TestUser;
let farmId: string;
const db = () => supabaseFactory(url, anonKey, serviceKey);
const app = () =>
  createApp({ corsOrigins: ['http://localhost:5173'], verifyToken: supabaseTokenVerifier(url), repo: supabaseRepo(db()), members: supabaseMembers(db()), data: loadData(), getRates: async () => null });
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [owner, stranger] = await Promise.all([makeUser('owner'), makeUser('stranger')]);
  const { data, error } = await owner.client.from('farmers').insert({ user_id: owner.id, name: 'Ferma Test', birth_year: 1968, county: 'TR' }).select('id').single();
  if (error) throw error;
  farmId = data.id;
});

afterAll(async () => {
  await Promise.all([owner, stranger].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe('the owner is a member (migration 035)', () => {
  it('a new farm gets exactly one owner row, its creator', async () => {
    const { data, error } = await admin.from('farm_members').select('user_id, role').eq('farmer_id', farmId);
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: owner.id, role: 'owner' }]);
  });

  it('every farm in the database has its owner (backfill and the trigger)', async () => {
    const [farms, owners] = await Promise.all([
      admin.from('farmers').select('id, user_id'),
      admin.from('farm_members').select('farmer_id, user_id').eq('role', 'owner'),
    ]);
    expect(farms.error).toBeNull();
    expect(owners.error).toBeNull();
    const ownerOf = new Map((owners.data ?? []).map((m) => [m.farmer_id, m.user_id]));
    const missing = (farms.data ?? []).filter((f) => ownerOf.get(f.id) !== f.user_id);
    expect(missing).toEqual([]);
  });

  it('a farm can’t have a second owner', async () => {
    const { error } = await admin.from('farm_members').insert({ farmer_id: farmId, user_id: stranger.id, role: 'owner' });
    expect(error).not.toBeNull();
  });

  it('the owner can’t leave or remove their own row', async () => {
    const { error } = await owner.client.from('farm_members').delete().eq('farmer_id', farmId).eq('user_id', owner.id);
    expect(error?.code).toBe('42501');
    expect((await admin.from('farm_members').select('id').eq('farmer_id', farmId).eq('role', 'owner')).data).toHaveLength(1);
    expect((await request(app()).delete(`/api/memberships/${farmId}`).set(as(owner))).status).toBe(404);
  });

  it('the owner is listed first on their farm (step 6), but isn’t a member of it for /contabil', async () => {
    const list = await request(app()).get('/api/farm/members').set(as(owner));
    expect(list.status).toBe(200);
    expect(list.body.members).toEqual([expect.objectContaining({ role: 'owner', you: true })]);
    expect((await request(app()).get('/api/memberships').set(as(owner))).body).toEqual({ farms: [] });
    expect((await request(app()).get(`/api/memberships/${farmId}`).set(as(owner))).status).toBe(404);
  });
});

describe('the access rule reads membership', () => {
  it('my_farm_ids: the owner gets the farm, by role and without, a stranger gets nothing', async () => {
    expect((await owner.client.rpc('my_farm_ids')).data).toEqual([farmId]);
    expect((await owner.client.rpc('my_farm_ids', { roles: ['owner'] })).data).toEqual([farmId]);
    expect((await owner.client.rpc('my_farm_ids', { roles: ['worker'] })).data).toEqual([]);
    expect((await stranger.client.rpc('my_farm_ids')).data).toEqual([]);
  });

  it('require_farm_role: the owner’s role, or 42501 with a hint', async () => {
    expect((await owner.client.rpc('require_farm_role', { p_farm: farmId, roles: ['owner', 'manager'] })).data).toBe('owner');
    const wrongRole = await owner.client.rpc('require_farm_role', { p_farm: farmId, roles: ['worker'] });
    expect(wrongRole.error).toMatchObject({ code: '42501', hint: 'role_not_allowed' });
    const notMine = await stranger.client.rpc('require_farm_role', { p_farm: farmId, roles: ['owner'] });
    expect(notMine.error).toMatchObject({ code: '42501', hint: 'not_a_member' });
  });

  it('the owner still reads and writes the farm’s tables; a stranger doesn’t', async () => {
    const add = await owner.client.from('parcels').insert({ farmer_id: farmId, crop_id: 'grau', area_ari: 500, is_arable: true });
    expect(add.error).toBeNull();
    expect((await owner.client.from('parcels').select('id').eq('farmer_id', farmId)).data).toHaveLength(1);
    expect((await owner.client.from('envelopes').select('id').eq('farmer_id', farmId)).error).toBeNull();
    expect((await stranger.client.from('parcels').select('id').eq('farmer_id', farmId)).data).toEqual([]);
    expect((await stranger.client.from('farmers').select('id').eq('id', farmId)).data).toEqual([]);
    const sneak = await stranger.client.from('parcels').insert({ farmer_id: farmId, crop_id: 'grau', area_ari: 100, is_arable: true });
    expect(sneak.error).not.toBeNull();
  });

  it('a stranger can’t make themselves a member', async () => {
    const { error } = await stranger.client.from('farm_members').insert({ farmer_id: farmId, user_id: stranger.id, role: 'manager' });
    expect(error).not.toBeNull();
  });
});

describe('profiles', () => {
  it('a new account gets one, readable only by its person', async () => {
    const mine = await owner.client.from('profiles').select('user_id').eq('user_id', owner.id);
    expect(mine.data).toEqual([{ user_id: owner.id }]);
    expect((await stranger.client.from('profiles').select('user_id').eq('user_id', owner.id)).data).toEqual([]);
  });

  it('remembers the last farm only if it’s one of mine', async () => {
    const ok = await owner.client.from('profiles').update({ last_farm_id: farmId }).eq('user_id', owner.id).select('last_farm_id');
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ last_farm_id: farmId }]);
    const notMine = await stranger.client.from('profiles').update({ last_farm_id: farmId }).eq('user_id', stranger.id);
    expect(notMine.error).not.toBeNull();
  });
});

describe('deleting still works', () => {
  it('deleting a farm takes its owner row with it', async () => {
    const extra = await makeUser('extra');
    try {
      const { data } = await admin.from('farmers').insert({ user_id: extra.id, name: 'De șters', birth_year: 1980, county: 'TR' }).select('id').single();
      expect((await admin.from('farm_members').select('id').eq('farmer_id', data!.id)).data).toHaveLength(1);
      expect((await admin.from('farmers').delete().eq('id', data!.id)).error).toBeNull();
      expect((await admin.from('farm_members').select('id').eq('farmer_id', data!.id)).data).toEqual([]);
    } finally {
      await admin.auth.admin.deleteUser(extra.id);
    }
  });

  it('deleting an account removes its farm, membership and profile', async () => {
    const gone = await makeUser('gone');
    const { data } = await admin.from('farmers').insert({ user_id: gone.id, name: 'Pleacă', birth_year: 1975, county: 'TR' }).select('id').single();
    const del = await admin.auth.admin.deleteUser(gone.id);
    expect(del.error).toBeNull();
    expect((await admin.from('farmers').select('id').eq('id', data!.id)).data).toEqual([]);
    expect((await admin.from('farm_members').select('id').eq('user_id', gone.id)).data).toEqual([]);
    expect((await admin.from('profiles').select('user_id').eq('user_id', gone.id)).data).toEqual([]);
  });
});
