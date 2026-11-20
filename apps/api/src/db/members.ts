import type { PostgrestError } from '@supabase/supabase-js';
import type { FarmPlots, InviteRefusal, MemberRole, StoredOperation, StoredPlot, StoredSeason } from '@cropcash/shared';
import { employeeFromRow } from './employees';
import { FARM_SELECT, type FarmRow } from './repo';
import type { SupabaseFactory } from './supabase';

/** A link the farmer can act on: why it didn't work. */
export class InviteError extends Error {
  constructor(readonly code: InviteRefusal) {
    super(code);
  }
}

export interface Member {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface OpenInvite {
  id: string;
  role: MemberRole;
  email: string | null;
  expires_at: string;
  created_at: string;
}

export interface Membership {
  farmerId: string;
  farmName: string;
  county: string;
  role: MemberRole;
  since: string;
}

/** What a member reads: the farm as /api/me has it, and its parcels. */
export interface MemberFarm {
  role: MemberRole;
  farmer: FarmRow & Record<string, unknown>;
  plots: FarmPlots;
}

/**
 * The farm's members (migration 028). The owner's calls and accepting a link act as the user (RLS).
 * Reading a farm for a member checks the membership as the user first, then reads with the service key.
 */
export interface MemberStore {
  createInvite(token: string, farmerId: string, invite: { role: MemberRole; email: string | null; tokenHash: string; expiresAt: string }): Promise<string>;
  /** The owner's members, and the links not yet used, cancelled or expired. */
  listForOwner(token: string, now: string): Promise<{ members: Member[]; invites: OpenInvite[] }>;
  removeMember(token: string, id: string): Promise<boolean>;
  revokeInvite(token: string, id: string, now: string): Promise<boolean>;
  accept(token: string, tokenHash: string): Promise<{ farmerId: string; farmName: string; role: MemberRole }>;
  memberships(token: string): Promise<Membership[]>;
  leave(token: string, farmerId: string): Promise<boolean>;
  /** Null when the user isn't a member of that farm. */
  memberFarm(token: string, farmerId: string): Promise<MemberFarm | null>;
  /** For the owner's list. Null when the account is gone. */
  emailOf(userId: string): Promise<string | null>;
  /** Supabase's invite email for a new account, its sign-in link for an existing one. */
  sendInvite(email: string, link: string): Promise<boolean>;
}

const refusalOf = (e: PostgrestError): Error => {
  const hint = e.hint as InviteRefusal | undefined;
  if ((e.code === 'P0002' || e.code === '22023') && hint && ['not_found', 'used', 'expired', 'own_farm'].includes(hint)) return new InviteError(hint);
  return new Error(e.message);
};

const PLOT_COLUMNS = 'id, name, county, siruta, bloc_fizic, parcel_no, land_use, auto_crop_id, archived_at';
const SEASON_COLUMNS = 'plot_id, harvest_year, crop_id, apia_crop_code, area_ari, sown_on, harvested_on';
const OPERATION_COLUMNS = 'id, plot_id, harvest_year, kind, status, on_date, product, dose, note, target, operator';

export function supabaseMembers(db: SupabaseFactory): MemberStore {
  return {
    async createInvite(token, farmerId, i) {
      const { data, error } = await db
        .forUser(token)
        .from('farm_invites')
        .insert({ farmer_id: farmerId, role: i.role, email: i.email, token_hash: i.tokenHash, expires_at: i.expiresAt })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },

    async listForOwner(token, now) {
      const client = db.forUser(token);
      /* The owner's policy shows their farm's rows; a member's own rows (another farm) are left out. */
      const mine = await client.rpc('my_memberships');
      if (mine.error) throw new Error(mine.error.message);
      const elsewhere = new Set((mine.data as { farmer_id: string }[]).map((m) => m.farmer_id));
      const [members, invites] = await Promise.all([
        client.from('farm_members').select('id, farmer_id, user_id, role, created_at').order('created_at'),
        client
          .from('farm_invites')
          .select('id, role, email, expires_at, created_at')
          .is('accepted_by', null)
          .is('revoked_at', null)
          .gt('expires_at', now)
          .order('created_at'),
      ]);
      if (members.error) throw new Error(members.error.message);
      if (invites.error) throw new Error(invites.error.message);
      return {
        members: (members.data as (Member & { farmer_id: string })[]).filter((m) => !elsewhere.has(m.farmer_id)).map(({ farmer_id: _f, ...m }) => m),
        invites: invites.data as OpenInvite[],
      };
    },

    async removeMember(token, id) {
      const { data, error } = await db.forUser(token).from('farm_members').delete().eq('id', id).select('id');
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },

    async revokeInvite(token, id, now) {
      const { data, error } = await db.forUser(token).from('farm_invites').update({ revoked_at: now }).eq('id', id).is('accepted_by', null).is('revoked_at', null).select('id');
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },

    async accept(token, tokenHash) {
      const { data, error } = await db.forUser(token).rpc('accept_farm_invite', { p_token_hash: tokenHash });
      if (error) throw refusalOf(error);
      const row = (data as { farmer_id: string; farm_name: string; role: MemberRole }[])[0];
      if (!row) throw new InviteError('not_found');
      return { farmerId: row.farmer_id, farmName: row.farm_name, role: row.role };
    },

    async memberships(token) {
      const { data, error } = await db.forUser(token).rpc('my_memberships');
      if (error) throw new Error(error.message);
      return (data as { farmer_id: string; farm_name: string; county: string; role: MemberRole; since: string }[]).map((m) => ({
        farmerId: m.farmer_id,
        farmName: m.farm_name,
        county: m.county,
        role: m.role,
        since: m.since,
      }));
    },

    async leave(token, farmerId) {
      /* As the user, the self policy only reaches their own row. */
      const client = db.forUser(token);
      const me = await client.auth.getUser(token);
      if (me.error || !me.data.user) throw new Error(me.error?.message ?? 'no user');
      const { data, error } = await client.from('farm_members').delete().eq('farmer_id', farmerId).eq('user_id', me.data.user.id).select('id');
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },

    async memberFarm(token, farmerId) {
      /* The check, as the user: RLS shows a member only their own membership rows. */
      const client = db.forUser(token);
      const me = await client.auth.getUser(token);
      if (me.error || !me.data.user) return null;
      const check = await client.from('farm_members').select('role').eq('farmer_id', farmerId).eq('user_id', me.data.user.id).maybeSingle();
      if (check.error) throw new Error(check.error.message);
      if (!check.data) return null;
      /* Then the farm, with the service key, for that one farm only. */
      const admin = db.admin();
      const [farm, plots, seasons, operations] = await Promise.all([
        admin.from('farmers').select(FARM_SELECT).eq('id', farmerId).maybeSingle(),
        admin.from('plots').select(PLOT_COLUMNS).eq('farmer_id', farmerId).order('created_at'),
        admin.from('plot_seasons').select(SEASON_COLUMNS).eq('farmer_id', farmerId).order('harvest_year'),
        admin.from('plot_operations').select(OPERATION_COLUMNS).eq('farmer_id', farmerId).order('on_date', { ascending: true, nullsFirst: false }),
      ]);
      for (const r of [farm, plots, seasons, operations]) if (r.error) throw new Error(r.error.message);
      if (!farm.data) return null;
      /* As getMyFarm reads it, so the plan comes out the same as on the farmer's phone. */
      const row = farm.data as unknown as FarmRow & { employees?: Record<string, unknown>[] };
      return {
        role: (check.data as { role: MemberRole }).role,
        farmer: (row.employees ? { ...row, employees: row.employees.map(employeeFromRow) } : row) as FarmRow & Record<string, unknown>,
        plots: { plots: plots.data as unknown as StoredPlot[], seasons: seasons.data as unknown as StoredSeason[], operations: operations.data as unknown as StoredOperation[] },
      };
    },

    async emailOf(userId) {
      const { data, error } = await db.admin().auth.admin.getUserById(userId);
      return error ? null : (data.user?.email ?? null);
    },

    async sendInvite(email, link) {
      const auth = db.admin().auth;
      const invited = await auth.admin.inviteUserByEmail(email, { redirectTo: link });
      if (!invited.error) return true;
      /* Already has an account: the sign-in link takes them straight to the invitation. */
      if (!/already|registered|exists/i.test(invited.error.message)) return false;
      const otp = await auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: link } });
      return !otp.error;
    },
  };
}
