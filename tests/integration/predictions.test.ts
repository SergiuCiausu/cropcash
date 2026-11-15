import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { StaleVersion, supabasePredictions } from '../../apps/api/src/db/predictions';
import { loadData, type Override } from '../../packages/shared/src';

/*
 * Migration 025 on the real Supabase project: everyone signed in reads the published changes, only the
 * service role publishes, and a publish is all or nothing. The changes published here keep the file's
 * own values, so the app's figures don't move while the test runs, and afterAll removes them.
 */

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const service = createClient(url, serviceKey, noSession);
const store = supabasePredictions(service);
const stamp = Date.now();

const wheat = loadData().crops.crops.find((c) => c.id === 'grau')!;
const same: Override[] = [
  { path: 'crops.crops[id=grau].price_lei_per_kg.mean', value: wheat.price_lei_per_kg.mean, reason: `test ${stamp}: valoarea din fișier` },
  { path: 'params.credit.robor_6m_pct.value', value: loadData().params.credit.robor_6m_pct.value, reason: `test ${stamp}: valoarea din fișier` },
];

let farmer: { id: string; client: SupabaseClient };
let anon: SupabaseClient;
const published: number[] = [];

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  const email = `predictions-${stamp}@cropcash.test`;
  const password = `Test-${stamp}-pw`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  farmer = { id: data.user.id, client };
  anon = createClient(url, anonKey, noSession);
});

afterAll(async () => {
  // Newest first, so a copy is gone before the version it copied.
  for (const v of [...published].sort((x, y) => y - x)) await service.from('prediction_versions').delete().eq('version', v);
  if (farmer) await service.auth.admin.deleteUser(farmer.id);
});

const count = async (table: string) => {
  const { count: n, error } = await service.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return n ?? 0;
};

describe('publishing (service role)', () => {
  it('publishes a version on top of the current one, and reads it back', async () => {
    const before = await store.current();
    const v = await store.publish({ baseVersion: before.version, note: `test ${stamp}`, overrides: same, by: farmer.id });
    published.push(v);
    expect(v).toBe(before.version + 1);
    const now = await store.current();
    expect(now.version).toBe(v);
    expect(now.overrides).toEqual([...same].sort((a, b) => a.path.localeCompare(b.path)));
    const [top] = await store.history(1);
    expect(top).toMatchObject({ version: v, note: `test ${stamp}`, changes: 2, publishedBy: farmer.id });
  });

  it('refuses a publish from a version that is no longer current, and writes nothing', async () => {
    const { version } = await store.current();
    const rows = await count('prediction_overrides');
    await expect(store.publish({ baseVersion: version - 1, note: 'vechi', overrides: same, by: farmer.id })).rejects.toBeInstanceOf(StaleVersion);
    expect((await store.current()).version).toBe(version);
    expect(await count('prediction_overrides')).toBe(rows);
  });

  it('writes nothing when one change is bad', async () => {
    const { version } = await store.current();
    const twice = [same[0]!, { ...same[0]!, value: 2 }];
    await expect(store.publish({ baseVersion: version, note: 'de două ori', overrides: twice, by: farmer.id })).rejects.toThrow();
    const object = [{ ...same[0]!, value: { lei: 1 } as unknown as number }];
    await expect(store.publish({ baseVersion: version, note: 'obiect', overrides: object, by: farmer.id })).rejects.toThrow();
    const noReason = [{ ...same[0]!, reason: ' ' }];
    await expect(store.publish({ baseVersion: version, note: 'fără motiv', overrides: noReason, by: farmer.id })).rejects.toThrow();
    expect((await store.current()).version).toBe(version);
  });

  it('goes back by publishing a copy of an older version', async () => {
    const first = published[0]!;
    const { version } = await store.current();
    const old = await store.version(first);
    const v = await store.publish({ baseVersion: version, note: `înapoi la ${first}`, overrides: old!.overrides, by: farmer.id, revertedFrom: first });
    published.push(v);
    expect(await store.version(v)).toMatchObject({ revertedFrom: first, overrides: old!.overrides });
  });

  it('an empty version means the files as written', async () => {
    const { version } = await store.current();
    const v = await store.publish({ baseVersion: version, note: `test ${stamp}: fără schimbări`, overrides: [], by: farmer.id });
    published.push(v);
    expect(await store.current()).toEqual({ version: v, overrides: [] });
  });
});

describe('Row Level Security', () => {
  it('a farmer reads the published changes', async () => {
    const mine = supabasePredictions(farmer.client);
    expect(await mine.current()).toEqual(await store.current());
  });

  it('a farmer cannot write, change or delete them', async () => {
    const versions = await count('prediction_versions');
    const rows = await count('prediction_overrides');
    const next = (await store.current()).version + 1;
    const insert = await farmer.client.from('prediction_versions').insert({ version: next, note: 'eu' });
    expect(insert.error).not.toBeNull();
    const row = await farmer.client.from('prediction_overrides').insert({ version: published[0], path: 'a.b', value: 1, reason: 'eu' });
    expect(row.error).not.toBeNull();
    await farmer.client.from('prediction_overrides').update({ reason: 'schimbat' }).eq('version', published[0]!);
    await farmer.client.from('prediction_overrides').delete().eq('version', published[0]!);
    await farmer.client.from('prediction_versions').delete().eq('version', published[0]!);
    expect(await count('prediction_versions')).toBe(versions);
    expect(await count('prediction_overrides')).toBe(rows);
    expect((await store.version(published[0]!))!.overrides).toEqual(expect.arrayContaining(same));
  });

  it('a farmer cannot publish', async () => {
    const { version } = await store.current();
    const { error } = await farmer.client.rpc('publish_prediction_version', {
      p_base: version,
      p_note: 'eu',
      p_overrides: [],
      p_by: farmer.id,
    });
    expect(error).not.toBeNull();
    expect((await store.current()).version).toBe(version);
  });

  it('without an account nothing can be read', async () => {
    const { data, error } = await anon.from('prediction_overrides').select('path');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
