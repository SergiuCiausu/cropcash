import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { grantRole, listRoles, revokeRole, userIdByEmail } from '../../apps/api/src/db/roles';

/*
 * Migration 035 on the real Supabase project: roles live in app_roles, a user reads only their own rows,
 * nobody can grant themselves a role, and has_role / is_admin answer from the table.
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
let editor: User;
let farmer: User;
let anon: SupabaseClient;

async function signUp(name: string): Promise<User> {
  const email = `roles-${name}-${stamp}@cropcash.test`;
  const password = `Test-${stamp}-pw`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

const rpc = async (c: SupabaseClient, fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw error;
  return data as boolean;
};

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env vars missing');
  [admin, editor, farmer] = await Promise.all([signUp('admin'), signUp('editor'), signUp('farmer')]);
  const { error } = await service.from('app_roles').insert([
    { user_id: admin.id, role: 'admin', note: `test ${stamp}` },
    { user_id: editor.id, role: 'catalogue_editor', granted_by: admin.id, note: `test ${stamp}` },
  ]);
  if (error) throw error;
  anon = createClient(url, anonKey, noSession);
});

afterAll(async () => {
  // Deleting the users cascades to their app_roles rows.
  for (const u of [admin, editor, farmer]) if (u) await service.auth.admin.deleteUser(u.id);
});

describe('has_role / is_admin', () => {
  it('says yes to an admin, for admin and for the lesser role', async () => {
    expect(await rpc(admin.client, 'is_admin')).toBe(true);
    expect(await rpc(admin.client, 'has_role', { p_role: 'admin' })).toBe(true);
    expect(await rpc(admin.client, 'has_role', { p_role: 'catalogue_editor' })).toBe(true);
  });

  it('gives a catalogue editor only that role', async () => {
    expect(await rpc(editor.client, 'is_admin')).toBe(false);
    expect(await rpc(editor.client, 'has_role', { p_role: 'catalogue_editor' })).toBe(true);
    expect(await rpc(editor.client, 'has_role', { p_role: 'admin' })).toBe(false);
  });

  it('says no to a plain farmer', async () => {
    expect(await rpc(farmer.client, 'is_admin')).toBe(false);
    expect(await rpc(farmer.client, 'has_role', { p_role: 'catalogue_editor' })).toBe(false);
  });

  it('is closed to visitors without a session', async () => {
    const { error } = await anon.rpc('is_admin');
    expect(error).not.toBeNull();
  });
});

describe('app_roles (RLS)', () => {
  it('lets a user read only their own rows', async () => {
    const { data, error } = await editor.client.from('app_roles').select('user_id, role');
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: editor.id, role: 'catalogue_editor' }]);
  });

  it('shows a plain farmer nothing', async () => {
    const { data, error } = await farmer.client.from('app_roles').select('user_id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses a farmer granting themselves admin', async () => {
    const { error } = await farmer.client.from('app_roles').insert({ user_id: farmer.id, role: 'admin' });
    expect(error).not.toBeNull();
    expect(await rpc(farmer.client, 'is_admin')).toBe(false);
  });

  it('refuses an editor promoting themselves', async () => {
    // authenticated has no update grant at all.
    const { error } = await editor.client.from('app_roles').update({ role: 'admin' }).eq('user_id', editor.id);
    expect(error).not.toBeNull();
    expect(await rpc(editor.client, 'is_admin')).toBe(false);
  });

  it('refuses an unknown role', async () => {
    const { error } = await service.from('app_roles').insert({ user_id: farmer.id, role: 'owner' });
    expect(error).not.toBeNull();
  });

  it('drops the rows when the user is deleted', async () => {
    const temp = await signUp('temp');
    await service.from('app_roles').insert({ user_id: temp.id, role: 'admin' });
    await service.auth.admin.deleteUser(temp.id);
    const { data } = await service.from('app_roles').select('user_id').eq('user_id', temp.id);
    expect(data).toEqual([]);
  });
});

describe('granting and revoking (apps/api/src/db/roles.ts, used by seed:demo and npm run admin:grant)', () => {
  it('finds a user by email, whatever its case, and nobody for an unknown one', async () => {
    expect(await userIdByEmail(service, `ROLES-FARMER-${stamp}@CropCash.test`)).toBe(farmer.id);
    expect(await userIdByEmail(service, `nobody-${stamp}@cropcash.test`)).toBeNull();
  });

  it('grants a role the user then has, and granting it twice changes nothing', async () => {
    await grantRole(service, farmer.id, 'catalogue_editor', `test ${stamp}`);
    await grantRole(service, farmer.id, 'catalogue_editor', 'second note');
    expect(await rpc(farmer.client, 'has_role', { p_role: 'catalogue_editor' })).toBe(true);
    const mine = (await listRoles(service)).filter((r) => r.userId === farmer.id);
    expect(mine).toEqual([expect.objectContaining({ role: 'catalogue_editor', email: `roles-farmer-${stamp}@cropcash.test`, note: `test ${stamp}` })]);
  });

  it('revokes it, and says when there was nothing to revoke', async () => {
    expect(await revokeRole(service, farmer.id, 'catalogue_editor')).toBe(true);
    expect(await rpc(farmer.client, 'has_role', { p_role: 'catalogue_editor' })).toBe(false);
    expect(await revokeRole(service, farmer.id, 'catalogue_editor')).toBe(false);
  });
});
