/* The farm's people (migration 026). Every call acts as the farmer, so RLS decides what they may see and change.
   Reading them comes with the farm (FARM_SELECT in repo.ts), so the plan has them on the phone too. */
import type { PostgrestError } from '@supabase/supabase-js';
import type { StoredEmployee } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export class EmployeesError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type EmployeeRow = Omit<StoredEmployee, 'id' | 'archived_at'>;

export interface EmployeeStore {
  /** Sent again with the same client id, it returns the first id. */
  add(token: string, farmerId: string, row: EmployeeRow, clientId?: string): Promise<string>;
  /** Replaces every field. False when the person isn't this farm's. */
  update(token: string, id: string, row: EmployeeRow): Promise<boolean>;
  /**
   * Archives the person. `endsOn` sets their last day when they had none; an earlier end date stays.
   * Archived again, it keeps the first archive time. False when the person isn't this farm's.
   */
  archive(token: string, id: string, endsOn: string | undefined, at: Date): Promise<boolean>;
  /** „Lucrările pe câmp le fac oamenii tăi?” on the farm (migration 030). */
  setOwnFieldWork(token: string, farmerId: string, value: boolean): Promise<void>;
}

export const EMPLOYEE_COLUMNS = 'id, name, role, kind, cost_bani, pay_basis, days_per_month, active_months, pay_day, starts_on, ends_on, archived_at';

/** bigint comes back as a number or a string, depending on its size. */
export const employeeFromRow = (r: Record<string, unknown>): StoredEmployee => ({ ...r, cost_bani: Number(r.cost_bani) }) as unknown as StoredEmployee;

function refusal(e: PostgrestError): Error {
  // 23514: a check in migration 026 (the same rules as EmployeeInputSchema, so only a stale phone gets here).
  if (e.code === '22023' || e.code === '23514' || e.code === '22P02' || e.code === '22007') return new EmployeesError(400, 'invalid_input', e.message);
  if (e.code === '23505') return new EmployeesError(409, 'already_saved', e.message);
  return new Error(e.message);
}

export function supabaseEmployees(db: SupabaseFactory): EmployeeStore {
  return {
    async add(token, farmerId, row, clientId) {
      const client = db.forUser(token);
      const { data, error } = await client
        .from('employees')
        .insert({ ...row, farmer_id: farmerId, client_id: clientId ?? null })
        .select('id')
        .single();
      // Sent before (the answer was lost): return the row already saved.
      if (error?.code === '23505' && clientId) {
        const again = await client.from('employees').select('id').eq('farmer_id', farmerId).eq('client_id', clientId).maybeSingle();
        if (again.error) throw refusal(again.error);
        if (again.data) return again.data.id as string;
      }
      if (error) throw refusal(error);
      return data.id as string;
    },

    async update(token, id, row) {
      const { data, error } = await db.forUser(token).from('employees').update(row).eq('id', id).select('id');
      if (error) throw refusal(error);
      return !!data?.length;
    },

    async archive(token, id, endsOn, at) {
      const client = db.forUser(token);
      const { data: now, error } = await client.from('employees').select('ends_on, archived_at, starts_on').eq('id', id).maybeSingle();
      if (error) throw refusal(error);
      if (!now) return false;
      const patch: Record<string, unknown> = {};
      if (!now.archived_at) patch.archived_at = at.toISOString();
      if (endsOn && (!now.ends_on || endsOn < now.ends_on)) {
        if (endsOn < now.starts_on) throw new EmployeesError(400, 'invalid_input', 'ends before it starts');
        patch.ends_on = endsOn;
      }
      if (Object.keys(patch).length === 0) return true;
      const res = await client.from('employees').update(patch).eq('id', id).select('id');
      if (res.error) throw refusal(res.error);
      return !!res.data?.length;
    },

    async setOwnFieldWork(token, farmerId, value) {
      const { error } = await db.forUser(token).from('farmers').update({ own_field_work: value }).eq('id', farmerId);
      if (error) throw refusal(error);
    },
  };
}
