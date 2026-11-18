import type { PostgrestError } from '@supabase/supabase-js';
import type { FarmPlots, StoredOperation, StoredPlot, StoredSeason } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

/** A refusal the farmer can act on. `code` goes to the phone as `error`. */
export class PlotsError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Parcels, seasons and operations (migration 020). Every call acts as the farmer: RLS applies. */
export interface PlotStore {
  list(token: string, year?: number): Promise<FarmPlots>;
  /** Rows as plotToRow builds them. Returns the parcel ids, in order. */
  save(token: string, year: number, rows: Record<string, unknown>[]): Promise<string[]>;
  /** A row as operationToRow builds it. Sent again with the same client_id, it returns the first id. */
  addOperation(token: string, row: Record<string, unknown>): Promise<string>;
  updateOperation(token: string, id: string, row: Record<string, unknown>): Promise<void>;
  /** False when there was nothing to remove. */
  removeOperation(token: string, id: string): Promise<boolean>;
}

const PLOT_COLUMNS =
  'id, name, county, siruta, village_siruta, bloc_fizic, parcel_no, lpis_fbid, land_use, geometry, shape, ' +
  'centroid_lat, centroid_lng, geometry_source, auto_crop_id, archived_at, tenure';
const SEASON_COLUMNS = 'plot_id, harvest_year, crop_id, apia_crop_code, area_ari, sown_on, harvested_on, second_crop_id';
const OPERATION_COLUMNS = 'id, plot_id, harvest_year, kind, status, on_date, product, dose, note, transaction_id, template_id';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Database errors the farmer can fix become PlotsError; anything else stays a server error. */
function refusal(e: PostgrestError): Error {
  if (e.code === '22023' && (e.hint === 'removed_but_mapped' || e.hint === 'below_mapped')) return new PlotsError(409, e.hint, e.message);
  if (e.code === '22023' && /at least one crop/.test(e.message)) return new PlotsError(409, 'no_crop_left', e.message);
  if (e.code === '22023' || e.code === '23514' || e.code === '22P02') return new PlotsError(400, 'invalid_input', e.message);
  if (e.code === 'P0002' && /no farm/.test(e.message)) return new PlotsError(404, 'no_farm', e.message);
  if (e.code === 'P0002' || e.code === '23503') return new PlotsError(404, 'not_found', e.message);
  if (e.code === '23505') return new PlotsError(409, 'already_saved', e.message);
  return new Error(e.message);
}

export function supabasePlots(db: SupabaseFactory): PlotStore {
  return {
    async list(token, year) {
      const client = db.forUser(token);
      let ops = client.from('plot_operations').select(OPERATION_COLUMNS).order('on_date', { ascending: true, nullsFirst: false });
      if (year !== undefined) ops = ops.eq('harvest_year', year);
      const [plots, seasons, operations] = await Promise.all([
        client.from('plots').select(PLOT_COLUMNS).order('created_at'),
        client.from('plot_seasons').select(SEASON_COLUMNS).order('harvest_year'),
        ops,
      ]);
      for (const r of [plots, seasons, operations]) if (r.error) throw refusal(r.error);
      return {
        // numeric comes back as a string from PostgREST.
        plots: (plots.data as unknown as StoredPlot[]).map((p) => ({ ...p, centroid_lat: num(p.centroid_lat), centroid_lng: num(p.centroid_lng) })),
        seasons: seasons.data as unknown as StoredSeason[],
        operations: operations.data as unknown as StoredOperation[],
      };
    },

    async save(token, year, rows) {
      const { data, error } = await db.forUser(token).rpc('save_plots', { p_harvest_year: year, p_plots: rows });
      if (error) throw refusal(error);
      return data as string[];
    },

    async addOperation(token, row) {
      const client = db.forUser(token);
      if (row.client_id) {
        const { data: seen, error } = await client.from('plot_operations').select('id').eq('client_id', row.client_id).maybeSingle();
        if (error) throw refusal(error);
        if (seen) return seen.id as string;
      }
      /* The parcel's own farm id; RLS hides other farms' parcels, so a foreign id is "not found". */
      const { data: plot, error: plotError } = await client.from('plots').select('farmer_id').eq('id', row.plot_id).maybeSingle();
      if (plotError) throw refusal(plotError);
      if (!plot) throw new PlotsError(404, 'not_found', 'unknown parcel');
      const { data, error } = await client
        .from('plot_operations')
        .insert({ ...row, farmer_id: plot.farmer_id })
        .select('id')
        .single();
      if (error) throw refusal(error);
      return data.id as string;
    },

    async updateOperation(token, id, row) {
      const { data, error } = await db.forUser(token).from('plot_operations').update(row).eq('id', id).select('id');
      if (error) throw refusal(error);
      if (!data?.length) throw new PlotsError(404, 'not_found', 'unknown operation');
    },

    async removeOperation(token, id) {
      const { data, error } = await db.forUser(token).from('plot_operations').delete().eq('id', id).select('id');
      if (error) throw refusal(error);
      return !!data?.length;
    },
  };
}
