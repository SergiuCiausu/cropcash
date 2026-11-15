import { EVENT_COLUMNS, OCCURRENCE_COLUMNS } from './events';
import { EMPLOYEE_COLUMNS, employeeFromRow } from './employees';
import { CONTRACT_COLUMNS, LANDOWNER_COLUMNS, contractFromRow } from './arenda';
import type { ApiaDecision, EnvelopeKind, farmSetupRow, Envelopes, FertilizerUse, HarvestsInput, StoredFarm } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export interface FarmRow extends StoredFarm {
  id: string;
  name: string;
  county: string;
  /** Moves up by one on each harvests save (migration 019). Missing before the migration ran. */
  harvests_version?: number;
}

export interface NewFarm {
  name: string;
  county: string;
  birthYear: number;
  startBalanceBani: number;
  parcels: { cropId: string; areaAri: number; plantedMonth?: string }[];
}

export type FarmSetup = ReturnType<typeof farmSetupRow>;

export interface NewCredit {
  amountBani: number;
  takeDate: string;
  repayDate: string;
  /** The phone's id for this credit: the same one sent again returns it without a second credit. */
  groupId?: string;
}

export interface NewSale {
  amountBani: number;
  date: string;
  cropId: string;
  harvestYear?: number;
  note?: string;
  /** The phone's id for this record: the same one sent again returns the saved row. */
  clientId?: string;
  docs?: RecordDocs;
  /** The parcel it came from. The (plot_id, farmer_id) key refuses another farm's parcel. */
  plotId?: string;
}

/** For the accountant and the diesel refund (migration 027). Litres in hundredths. */
export interface RecordDocs {
  docNo?: string;
  counterparty?: string;
  fuelLitersCl?: number;
}

/** Only the columns that are set, so a record without them writes what it always wrote. */
const docColumns = (d: RecordDocs | undefined) => ({
  ...(d?.docNo ? { doc_no: d.docNo } : {}),
  ...(d?.counterparty ? { counterparty: d.counterparty } : {}),
  ...(d?.fuelLitersCl ? { fuel_liters_cl: d.fuelLitersCl } : {}),
});

export interface NewExpense {
  amountBani: number;
  date: string;
  category: string;
  cropId?: string;
  harvestYear?: number;
  note?: string;
  envelope?: EnvelopeKind;
  clientId?: string;
  /** Which fertilizer and how much (migration 024). Only on a fertilizer expense. */
  fertilizer?: FertilizerUse;
  /** The parcel it was for (migration 020). */
  plotId?: string;
  /** Whose pay it was (migration 026). Only on a salaries expense. */
  employeeId?: string;
  docs?: RecordDocs;
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
  /** „Cum lucrezi pământul?” and the arendă hectares (migration 032). Only the columns given change. */
  setFarmSetup(token: string, farmerId: string, setup: FarmSetup): Promise<void>;
  /**
   * Saves the document only if the farm is still at `version`, and returns the new version.
   * Throws RepoError 'conflict' when another save got there first (IDEM-12).
   */
  setHarvests(token: string, farmerId: string, harvests: HarvestsInput, version: number): Promise<number>;
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
  'id, name, county, birth_year, start_balance_bani, pension_fund_id, demo_now, stripe_account_id, salary_bani, harvests, harvests_version, apia_decision, own_field_work, farm_mode, leased_in_ari, leased_out_ari, landowner_count',
  'parcels (crop_id, area_ari, is_arable, planted_month)',
  'envelopes (kind, balance_bani)',
  'expected_payments (id, group_id, kind, direction, amount_probable_bani, window_start, status)',
  'transactions (id, kind, category, crop_id, plot_id, amount_bani, occurred_at, note, source, expected_payment_id, harvest_year, fertilizer_product_id, fertilizer_qty, fertilizer_unit, doc_no, counterparty, fuel_liters_cl, employee_id)',
  'task_completions (task_id)',
  'payouts (id, amount_bani, scheduled_for, status)',
  'pension_plans (monthly_bani, status)',
  'opportunity_follows (stable_key, opportunities (id, title, deadline, url))',
  // The farmer's own calendar events (migration 023): the planned sums change the plan.
  `farm_events (${EVENT_COLUMNS}, farm_event_occurrences (${OCCURRENCE_COLUMNS}))`,
  // The farm's people (migration 026), archived ones too: the plan needs their past months.
  `employees (${EMPLOYEE_COLUMNS})`,
  // Landowners and arendă contracts (migration 033), archived ones too.
  `landowners (${LANDOWNER_COLUMNS})`,
  `lease_contracts (${CONTRACT_COLUMNS})`,
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
      if (!data) return null;
      const farm = data as unknown as FarmRow & { employees?: Record<string, unknown>[]; lease_contracts?: Record<string, unknown>[] };
      return {
        ...farm,
        ...(farm.employees ? { employees: farm.employees.map(employeeFromRow) } : {}),
        ...(farm.lease_contracts ? { lease_contracts: farm.lease_contracts.map(contractFromRow) } : {}),
      } as FarmRow;
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
      const groupId = c.groupId ?? crypto.randomUUID();
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
      // Sent before (the answer was lost): both rows are already there, as one insert.
      if (error?.code === '23505' && c.groupId) return groupId;
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
          plot_id: s.plotId ?? null,
          ...docColumns(s.docs),
        })
        .select('id')
        .single();
      // Sent before (the answer was lost): return the row already saved.
      if (error?.code === '23505' && s.clientId) {
        const again = await db.forUser(token).from('transactions').select('id').eq('client_id', s.clientId).single();
        if (again.error) throw new RepoError('db_error', again.error.message);
        return again.data.id as string;
      }
      if (error?.code === '23503') throw new RepoError('not_found', error.message);
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
        p_fertilizer_product_id: e.fertilizer?.productId ?? null,
        p_fertilizer_qty: e.fertilizer?.qty ?? null,
        p_fertilizer_unit: e.fertilizer?.unit ?? null,
        p_plot_id: e.plotId ?? null,
        // Only when set, so an API deployed before migration 026 still finds the 12-argument function.
        ...(e.employeeId ? { p_employee_id: e.employeeId } : {}),
      });
      // 23503: the fertilizer isn't in the catalogue.
      if (error) {
        const code = error.code === 'P0002' ? 'not_found' : error.code === '23503' ? 'invalid' : 'db_error';
        throw new RepoError(code, error.message);
      }
      /* record_expense stays as in 024: the document and the litres go on the row it just made.
         Sent again, the same values land on the same row. */
      const docs = docColumns(e.docs);
      if (Object.keys(docs).length) {
        const set = await db.forUser(token).from('transactions').update(docs).eq('id', data as string).eq('source', 'manual');
        if (set.error) throw new RepoError('db_error', set.error.message);
      }
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

    async setFarmSetup(token, farmerId, setup) {
      const { error } = await db.forUser(token).from('farmers').update(setup).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setApiaDecision(token, farmerId, decision) {
      const { error } = await db.forUser(token).from('farmers').update({ apia_decision: decision }).eq('id', farmerId);
      if (error) throw new RepoError('db_error', error.message);
    },

    async setHarvests(token, farmerId, harvests, version) {
      const { data, error } = await db
        .forUser(token)
        .from('farmers')
        .update({ harvests, harvests_version: version + 1 })
        .eq('id', farmerId)
        .eq('harvests_version', version)
        .select('harvests_version');
      if (error) throw new RepoError('db_error', error.message);
      if (!data?.length) throw new RepoError('conflict', 'harvests changed since this version');
      return version + 1;
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
