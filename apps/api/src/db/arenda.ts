/* Landowners and arendă contracts (migration 033), and a parcel's tenure (032). Every call acts as the farmer, so
   RLS decides what they may see and change. Reading them comes with the farm (FARM_SELECT in repo.ts). */
import type { PostgrestError } from '@supabase/supabase-js';
import type { PlotTenure, StoredContract, StoredLandowner } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export class ArendaError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type LandownerRow = Omit<StoredLandowner, 'id' | 'archived_at'>;
export type ContractRow = Omit<StoredContract, 'id' | 'archived_at'>;

export interface ArendaStore {
  /** Sent again with the same client id, they return the first id. */
  addLandowner(token: string, farmerId: string, row: LandownerRow, clientId?: string): Promise<string>;
  /** False when the landowner isn't this farm's. */
  updateLandowner(token: string, id: string, row: LandownerRow): Promise<boolean>;
  /** Archives the landowner and their contracts. False when not this farm's. */
  archiveLandowner(token: string, id: string, at: Date): Promise<boolean>;
  /** ArendaError 404 `unknown_landowner` / `unknown_parcel` when they aren't this farm's. */
  addContract(token: string, farmerId: string, row: ContractRow, clientId?: string): Promise<string>;
  updateContract(token: string, id: string, row: ContractRow): Promise<boolean>;
  archiveContract(token: string, id: string, at: Date): Promise<boolean>;
  /** False when the parcel isn't this farm's. */
  setPlotTenure(token: string, plotId: string, tenure: PlotTenure): Promise<boolean>;
  setLandownerCount(token: string, farmerId: string, count: number | null): Promise<void>;
}

export const LANDOWNER_COLUMNS = 'id, name, locality, phone, payment, note, archived_at';
export const CONTRACT_COLUMNS =
  'id, landowner_id, direction, area_ari, locality, plot_ids, starts_on, ends_on, rent_bani_per_ha, rent_kg_per_ha, rent_crop_id, ' +
  'pay_month, land_tax_by, registration_no, registration_date, decision, decided_on, archived_at';

/** bigint comes back as a number or a string, depending on its size. */
export const contractFromRow = (r: Record<string, unknown>): StoredContract =>
  ({ ...r, rent_bani_per_ha: r.rent_bani_per_ha === null || r.rent_bani_per_ha === undefined ? null : Number(r.rent_bani_per_ha) }) as unknown as StoredContract;

function refusal(e: PostgrestError): Error {
  // 23514: a check in migration 033 (the same rules as the schemas, so only a stale phone gets here).
  if (e.code === '22023' || e.code === '23514' || e.code === '22P02' || e.code === '22007') return new ArendaError(400, 'invalid_input', e.message);
  // 23503: the landowner is another farm's (the foreign key is on (landowner_id, farmer_id)).
  if (e.code === '23503') return new ArendaError(404, 'unknown_landowner', e.message);
  if (e.code === '23505') return new ArendaError(409, 'already_saved', e.message);
  return new Error(e.message);
}

export function supabaseArenda(db: SupabaseFactory): ArendaStore {
  /** A contract names only this farm's parcels. RLS hides other farms' rows, so they count as missing. */
  async function checkPlots(token: string, ids: string[]) {
    if (ids.length === 0) return;
    const { data, error } = await db.forUser(token).from('plots').select('id').in('id', ids);
    if (error) throw refusal(error);
    if ((data ?? []).length !== ids.length) throw new ArendaError(404, 'unknown_parcel', 'a parcel is not this farm');
  }

  async function insertOnce(token: string, table: string, row: Record<string, unknown>, farmerId: string, clientId?: string) {
    const client = db.forUser(token);
    const { data, error } = await client.from(table).insert({ ...row, farmer_id: farmerId, client_id: clientId ?? null }).select('id').single();
    // Sent before (the answer was lost): return the row already saved.
    if (error?.code === '23505' && clientId) {
      const again = await client.from(table).select('id').eq('farmer_id', farmerId).eq('client_id', clientId).maybeSingle();
      if (again.error) throw refusal(again.error);
      if (again.data) return again.data.id as string;
    }
    if (error) throw refusal(error);
    return data.id as string;
  }

  async function update(token: string, table: string, id: string, patch: Record<string, unknown>) {
    const { data, error } = await db.forUser(token).from(table).update(patch).eq('id', id).select('id');
    if (error) throw refusal(error);
    return !!data?.length;
  }

  /** Archived again, a row keeps its first archive time. */
  async function archive(token: string, table: string, id: string, at: Date, before?: () => Promise<void>) {
    const { data: now, error } = await db.forUser(token).from(table).select('archived_at').eq('id', id).maybeSingle();
    if (error) throw refusal(error);
    if (!now) return false;
    if (now.archived_at) return true;
    await before?.();
    return update(token, table, id, { archived_at: at.toISOString() });
  }

  return {
    addLandowner: (token, farmerId, row, clientId) => insertOnce(token, 'landowners', row, farmerId, clientId),
    updateLandowner: (token, id, row) => update(token, 'landowners', id, row),

    archiveLandowner: (token, id, at) =>
      archive(token, 'landowners', id, at, async () => {
        const { error } = await db.forUser(token).from('lease_contracts').update({ archived_at: at.toISOString() }).eq('landowner_id', id).is('archived_at', null);
        if (error) throw refusal(error);
      }),

    async addContract(token, farmerId, row, clientId) {
      await checkPlots(token, row.plot_ids);
      return insertOnce(token, 'lease_contracts', row, farmerId, clientId);
    },

    async updateContract(token, id, row) {
      await checkPlots(token, row.plot_ids);
      return update(token, 'lease_contracts', id, row);
    },

    archiveContract: (token, id, at) => archive(token, 'lease_contracts', id, at),

    setPlotTenure: (token, plotId, tenure) => update(token, 'plots', plotId, { tenure }),

    async setLandownerCount(token, farmerId, count) {
      const { error } = await db.forUser(token).from('farmers').update({ landowner_count: count }).eq('id', farmerId);
      if (error) throw refusal(error);
    },
  };
}
