import type { ApiaDecision, EnvelopeKind, Envelopes, HarvestsInput, StoredFarm } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export interface FarmRow extends StoredFarm {
  id: string;
  name: string;
  county: string;
}

export interface NewFarm {
  name: string;
  county: string;
  birthYear: number;
  startBalanceBani: number;
  parcels: { cropId: string; areaAri: number; plantedMonth?: string }[];
}

export interface NewCredit {
  amountBani: number;
  takeDate: string;
  repayDate: string;
}

export interface NewSale {
  amountBani: number;
  date: string;
  cropId: string;
  harvestYear?: number;
  note?: string;
  /** The phone's id for this record: the same one sent again returns the saved row. */
  clientId?: string;
}

export interface NewExpense {
  amountBani: number;
  date: string;
  category: string;
  cropId?: string;
  harvestYear?: number;
  note?: string;
  envelope?: EnvelopeKind;
  clientId?: string;
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
  addSale(token: string, farmerId: string, sale: NewSale): Promise<string>;
  addExpense(token: string, expense: NewExpense): Promise<string>;
  undoTransaction(token: string, id: string): Promise<boolean>;
  completeTask(token: string, farmerId: string, taskId: string): Promise<void>;
  reopenTask(token: string, taskId: string): Promise<boolean>;
  updateFarm(token: string, farm: NewFarm): Promise<void>;
  setHarvests(token: string, farmerId: string, harvests: HarvestsInput): Promise<void>;
  /** Null removes it, and the plan goes back to the estimate. */
  setApiaDecision(token: string, farmerId: string, decision: ApiaDecision | null): Promise<void>;
  setPensionFund(token: string, farmerId: string, fundId: string | null): Promise<void>;
  /** Fixes the monthly salary (bani) the farmer accepted. */
  setSalary(token: string, farmerId: string, salaryBani: number): Promise<void>;
  /** Undefined when the call doesn't exist, null when it has no deadline yet. */
  opportunityDeadline(token: string, key: string): Promise<string | null | undefined>;
  followOpportunity(token: string, farmerId: string, key: string): Promise<void>;
  unfollowOpportunity(token: string, key: string): Promise<void>;
}

const parcelRow = (p: NewFarm['parcels'][number]) => ({
  crop_id: p.cropId,
  area_ari: p.areaAri,
  ...(p.plantedMonth ? { planted_month: p.plantedMonth } : {}),
});

export const FARM_SELECT = [
  'id, name, county, birth_year, start_balance_bani, pension_fund_id, demo_now, stripe_account_id, salary_bani, harvests, apia_decision',
  'parcels (crop_id, area_ari, is_arable, planted_month)',
  'envelopes (kind, balance_bani)',
  'expected_payments (id, group_id, kind, direction, amount_probable_bani, window_start, status)',
  'transactions (id, kind, category, crop_id, amount_bani, occurred_at, note, source, expected_payment_id, harvest_year)',
  'task_completions (task_id)',
  'payouts (id, amount_bani, scheduled_for, status)',
  'pension_plans (monthly_bani, status)',
  'opportunity_follows (stable_key, opportunities (id, title, deadline, url))',
].join(', ');

export function supabaseRepo(db: SupabaseFactory): Repo {
  return {
    async opportunityDeadline(token, key) {
      const { data, error } = await db.forUser(token).from('opportunities').select('deadline').eq('stable_key', key).maybeSingle();
      if (error) throw new RepoError('db_error', error.message);
      return data ? (data.deadline as string | null) : undefined;
    },

    async followOpportunity(token, farmerId, key) {
      const { error } = await db
        .forUser(token)
        .from('opportunity_follows')
        .upsert({ farmer_id: farmerId, stable_key: key }, { onConflict: 'farmer_id,stable_key', ignoreDuplicates: true });
      if (error) throw new RepoError('db_error', error.message);
    },

    async unfollowOpportunity(token, key) {
      const { error } = await db.forUser(token).from('opportunity_follows').delete().eq('stable_key', key);
      if (error) throw new RepoError('db_error', error.message);
    },

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
        p_parcels: farm.parcels.map(parcelRow),
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

    async addSale(token, farmerId, s) {
      const { data, error } = await db
        .forUser(token)
        .from('transactions')
        .insert({
          farmer_id: farmerId,
          amount_bani: s.amountBani,
          occurred_at: `${s.date}T12:00:00Z`,
          source: 'manual',
          kind: 'sale',
          crop_id: s.cropId,
          harvest_year: s.harvestYear ?? null,
          note: s.note ?? null,
          client_id: s.clientId ?? null,
        })
        .select('id')
        .single();
      // Sent before (the answer was lost): return the row already saved.
      if (error?.code === '23505' && s.clientId) {
        const again = await db.forUser(token).from('transactions').select('id').eq('client_id', s.clientId).single();
        if (again.error) throw new RepoError('db_error', again.error.message);
        return again.data.id as string;
      }
      if (error) throw new RepoError('db_error', error.message);
      return data.id as string;
    },

    async addExpense(token, e) {
      const { data, error } = await db.forUser(token).rpc('record_expense', {
        p_amount_bani: e.amountBani,
        p_date: e.date,
        p_category: e.category,
        p_crop_id: e.cropId ?? null,
        p_note: e.note ?? null,
        p_envelope: e.envelope ?? null,
        p_harvest_year: e.harvestYear ?? null,
        p_client_id: e.clientId ?? null,
      });
      if (error) throw new RepoError(error.code === 'P0002' ? 'not_found' : 'db_error', error.message);
      return data as string;
    },

    async undoTransaction(token, id) {
      const { data, error } = await db.forUser(token).rpc('undo_transaction', { p_id: id });
      if (error) throw new RepoError('db_error', error.message);
      return data === true;
    },

    async completeTask(token, farmerId, taskId) {
      const { error } = await db
        .forUser(token)
        .from('task_completions')
        .upsert({ farmer_id: farmerId, task_id: taskId }, { onConflict: 'farmer_id,task_id', ignoreDuplicates: true });
      if (error) throw new RepoError('db_error', error.message);
    },

    async reopenTask(token, taskId) {
      const { data, error } = await db.forUser(token).from('task_completions').delete().eq('task_id', taskId).select('task_id');
      if (error) throw new RepoError('db_error', error.message);
      return (data?.length ?? 0) > 0;
    },

    async updateFarm(token, farm) {
      const { error } = await db.forUser(token).rpc('update_farm', {
        p_name: farm.name,
        p_county: farm.county,
        p_birth_year: farm.birthYear,
        p_parcels: farm.parcels.map(parcelRow),
        p_start_balance_bani: farm.startBalanceBani,
      });
      if (error) {
        throw new RepoError(error.code === '22023' ? 'invalid' : error.code === 'P0002' ? 'not_found' : 'db_error', error.message);
      }
    },

    async setApiaDecision(token, farmerId, decision) {
      const { error } = await db.forUser(token).from('farmers').update({ apia_decision: decision }).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setHarvests(token, farmerId, harvests) {
      const { error } = await db.forUser(token).from('farmers').update({ harvests }).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setSalary(token, farmerId, salaryBani) {
      const { error } = await db.forUser(token).from('farmers').update({ salary_bani: salaryBani }).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setPensionFund(token, farmerId, fundId) {
      const { error } = await db.forUser(token).from('farmers').update({ pension_fund_id: fundId }).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setEnvelopes(token, balances) {
      const { error } = await db.forUser(token).rpc('set_envelopes', { p_balances: balances });
      if (error) {
        throw new RepoError(error.code === '22023' ? 'invalid' : error.code === 'P0002' ? 'not_found' : 'db_error', error.message);
      }
    },
  };
}
