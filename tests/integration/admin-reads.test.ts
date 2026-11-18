import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * Migration 037 on the real Supabase project: an admin (app_roles, 035) reads the monitor's sources, runs and
 * change events, and the two admin views; a farmer and a visitor get nothing. Reads the monitor's real data,
 * so it needs at least one source and one opportunity (npm run seed -w subventii-monitor).
 */

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const service = createClient(url, serviceKey, noSession);
const stamp = Date.now();

interface User {
  id: string;
  client: SupabaseClient;
}
let admin: User;
let farmer: User;
let anon: SupabaseClient;
let followedKey: string;
const farmerIds: string[] = [];

async function signUp(name: string): Promise<User> {
  const email = `admin-reads-${name}-${stamp}@cropcash.test`;
  const password = `Test-${stamp}-pw`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

const total = async (c: SupabaseClient, table: string) => {
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
};

const MONITOR_TABLES = ['sources', 'runs', 'change_events'];
const VIEWS = ['admin_source_health', 'admin_opportunities'];

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [admin, farmer] = await Promise.all([signUp('admin'), signUp('farmer')]);
  const role = await service.from('app_roles').insert({ user_id: admin.id, role: 'admin', note: `test ${stamp}` });
  if (role.error) throw role.error;
  anon = createClient(url, anonKey, noSession);

  // Two farms follow one call, so the count covers farms the admin can't see.
  const { data: opp, error: oppErr } = await service.from('opportunities').select('stable_key').limit(1).single();
  if (oppErr) throw oppErr;
  followedKey = opp.stable_key;
  for (const user of [farmer, admin]) {
    const { data: farm, error } = await service
      .from('farmers')
      .insert({ user_id: user.id, name: `Test ${stamp}`, birth_year: 1970, county: 'TR' })
      .select('id')
      .single();
    if (error) throw error;
    farmerIds.push(farm.id);
    const follow = await service.from('opportunity_follows').insert({ farmer_id: farm.id, stable_key: followedKey });
    if (follow.error) throw follow.error;
  }
});

afterAll(async () => {
  if (farmerIds.length) await service.from('farmers').delete().in('id', farmerIds);
  for (const u of [admin, farmer]) if (u) await service.auth.admin.deleteUser(u.id);
});

describe('an admin', () => {
  it('reads every row of the monitor tables', async () => {
    for (const t of MONITOR_TABLES) expect(await total(admin.client, t), t).toBe(await total(service, t));
  });

  it('sees every source in admin_source_health, with its last event', async () => {
    expect(await total(admin.client, 'admin_source_health')).toBe(await total(service, 'sources'));
    const { data, error } = await admin.client.from('admin_source_health').select('id, state, last_event_kind, last_event_at').not('last_event_at', 'is', null).limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it('sees every call in admin_opportunities, including the ones farmers never see', async () => {
    expect(await total(admin.client, 'admin_opportunities')).toBe(await total(service, 'opportunities'));
    const hidden = await service.from('opportunities').select('*', { count: 'exact', head: true }).eq('relevance', 'not_relevant');
    const shown = await admin.client.from('admin_opportunities').select('*', { count: 'exact', head: true }).eq('relevance', 'not_relevant');
    expect(shown.count).toBe(hidden.count);
  });

  it('counts the farms that follow a call, its own and others', async () => {
    const { data, error } = await admin.client.from('admin_opportunities').select('followers, changes').eq('stable_key', followedKey).single();
    expect(error).toBeNull();
    expect(data!.followers).toBe(2);
    expect(typeof data!.changes).toBe('number');
  });
});

describe('a farmer', () => {
  it('gets no rows from the monitor tables or the admin views', async () => {
    for (const t of [...MONITOR_TABLES, ...VIEWS]) expect(await total(farmer.client, t), t).toBe(0);
  });

  it('gets no follower counts', async () => {
    const { data, error } = await farmer.client.rpc('admin_opportunity_followers');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('still reads opportunities the way the app always did', async () => {
    expect(await total(farmer.client, 'opportunities')).toBe(await total(service, 'opportunities'));
  });
});

describe('a visitor without a session', () => {
  it('is refused everywhere', async () => {
    for (const t of [...MONITOR_TABLES, ...VIEWS]) {
      const { data, error } = await anon.from(t).select('*').limit(1);
      expect(error !== null || (data ?? []).length === 0, t).toBe(true);
    }
    expect((await anon.rpc('admin_opportunity_followers')).error).not.toBeNull();
  });
});
