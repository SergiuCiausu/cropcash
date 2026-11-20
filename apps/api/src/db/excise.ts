/* Which excise schemes the farm joined (migration 052, docs/accize-plan.md §2.2). Every call acts as the farmer,
   so RLS decides: owner and manager write, the accountant only reads, a worker sees nothing. */
import type { ExciseEnrollment, ExciseEnrollmentStatus } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export class ExciseRefused extends Error {}

export interface ExciseStore {
  /** The farm's rows, every year, newest year first. */
  list(token: string, farmerId: string): Promise<ExciseEnrollment[]>;
  /** Insert or replace the row for (farm, scheme, year). ExciseRefused when RLS says no (an accountant). */
  set(token: string, farmerId: string, row: { schemeId: string; year: number; status: ExciseEnrollmentStatus; acordOn: string | null }): Promise<ExciseEnrollment>;
}

const COLUMNS = 'scheme_id, year, status, acord_on, updated_at';

interface Row {
  scheme_id: string;
  year: number;
  status: ExciseEnrollmentStatus;
  acord_on: string | null;
  updated_at: string;
}
const fromRow = (r: Row): ExciseEnrollment => ({ schemeId: r.scheme_id, year: r.year, status: r.status, acordOn: r.acord_on, updatedAt: r.updated_at });

export function supabaseExcise(db: SupabaseFactory): ExciseStore {
  return {
    async list(token, farmerId) {
      const { data, error } = await db
        .forUser(token)
        .from('farm_excise_schemes')
        .select(COLUMNS)
        .eq('farmer_id', farmerId)
        .order('year', { ascending: false })
        .order('scheme_id');
      if (error) throw new Error(error.message);
      return (data as Row[]).map(fromRow);
    },

    async set(token, farmerId, row) {
      const { data, error } = await db
        .forUser(token)
        .from('farm_excise_schemes')
        .upsert(
          { farmer_id: farmerId, scheme_id: row.schemeId, year: row.year, status: row.status, acord_on: row.acordOn },
          { onConflict: 'farmer_id,scheme_id,year' },
        )
        .select(COLUMNS)
        .single();
      // 42501: RLS refused the write (a reader on this farm).
      if (error?.code === '42501') throw new ExciseRefused(error.message);
      if (error) throw new Error(error.message);
      return fromRow(data as Row);
    },
  };
}
