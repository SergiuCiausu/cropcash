import type { StoredFarm } from '@cropcash/shared';
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
  parcels: { cropId: string; areaAri: number }[];
}

export class RepoError extends Error {
  constructor(public code: 'conflict' | 'db_error', message: string) {
    super(message);
  }
}

/** Data access for user requests. Every method acts as the user (RLS applies). */
export interface Repo {
  getMyFarm(token: string): Promise<FarmRow | null>;
  createFarm(token: string, farm: NewFarm): Promise<string>;
}

export function supabaseRepo(db: SupabaseFactory): Repo {
  return {
    async getMyFarm(token) {
      const { data, error } = await db
        .forUser(token)
        .from('farmers')
        .select('id, name, county, birth_year, start_balance_bani, parcels (crop_id, area_ari, is_arable)')
        .maybeSingle();
      if (error) throw new RepoError('db_error', error.message);
      return (data as FarmRow | null) ?? null;
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
  };
}
