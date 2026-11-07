import type { Envelopes, PlanFarm } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export interface FarmRow extends PlanFarm {
  id: string;
  name: string;
  county: string;
}

export interface NewFarm {
  name: string;
  county: string;
  birthYear: number;
  startBalanceBani: number;
  parcels: { cropId: string; areaAri: number }[];
}

export interface NewCredit {
  amountBani: number;
  takeDate: string;
  repayDate: string;
}

export class RepoError extends Error {
  constructor(
    public code: 'conflict' | 'invalid' | 'not_found' | 'db_error',
    message: string,
  ) {
    super(message);
  }
}

/** Data access for user requests. Every method acts as the user (RLS applies). */
export interface Repo {
  getMyFarm(token: string): Promise<FarmRow | null>;
  createFarm(token: string, farm: NewFarm): Promise<string>;
  addCredit(token: string, farmerId: string, credit: NewCredit): Promise<string>;
  deleteCredit(token: string, groupId: string): Promise<boolean>;
  setEnvelopes(token: string, balances: Envelopes): Promise<void>;
}

const FARM_SELECT = [
  'id, name, county, birth_year, start_balance_bani, demo_now, stripe_account_id',
  'parcels (crop_id, area_ari, is_arable)',
  'envelopes (kind, balance_bani)',
  'expected_payments (id, group_id, kind, direction, amount_probable_bani, window_start, status)',
  'transactions (amount_bani, kind, occurred_at, crop_id)',
  'pension_plans (monthly_bani, status)',
  'payouts (amount_bani, scheduled_for, status)',
].join(', ');

export function supabaseRepo(db: SupabaseFactory): Repo {
  return {
    async getMyFarm(token) {
      const { data, error } = await db.forUser(token).from('farmers').select(FARM_SELECT).maybeSingle();
      if (error) throw new RepoError('db_error', error.message);
      return (data as unknown as FarmRow | null) ?? null;
    },

    async createFarm(token, farm) {
      const { data, error } = await db.forUser(token).rpc('create_farm', {
        p_name: farm.name,
        p_county: farm.county,
        p_birth_year: farm.birthYear,
        p_parcels: farm.parcels.map((p) => ({ crop_id: p.cropId, area_ari: p.areaAri })),
        p_start_balance_bani: farm.startBalanceBani,
      });
      if (error) {
        // 23505 = unique_violation: this user already has a farm.
        throw new RepoError(error.code === '23505' ? 'conflict' : 'db_error', error.message);
      }
      return data as string;
    },

    async addCredit(token, farmerId, c) {
      const groupId = crypto.randomUUID();
      const row = (kind: string, direction: 'in' | 'out', date: string) => ({
        farmer_id: farmerId,
        group_id: groupId,
        kind,
        direction,
        amount_min_bani: c.amountBani,
        amount_probable_bani: c.amountBani,
        amount_max_bani: c.amountBani,
        window_start: date,
        window_end: date,
      });
      const { error } = await db
        .forUser(token)
        .from('expected_payments')
        .insert([row('credit', 'in', c.takeDate), row('loan_repayment', 'out', c.repayDate)]);
      if (error) throw new RepoError('db_error', error.message);
      return groupId;
    },

    async deleteCredit(token, groupId) {
      const { data, error } = await db
        .forUser(token)
        .from('expected_payments')
        .delete()
        .eq('group_id', groupId)
        .in('kind', ['credit', 'loan_repayment'])
        .select('id');
      if (error) throw new RepoError('db_error', error.message);
      return (data?.length ?? 0) > 0;
    },

    async setEnvelopes(token, balances) {
      const { error } = await db.forUser(token).rpc('set_envelopes', { p_balances: balances });
      if (error) {
        throw new RepoError(error.code === '22023' ? 'invalid' : error.code === 'P0002' ? 'not_found' : 'db_error', error.message);
      }
    },
  };
}
