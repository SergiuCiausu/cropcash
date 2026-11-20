/* The local copy of SIRUTA and the blocuri fizice (migration 034, docs/harta-plan.md step 1b) as an
   LpisSource, and the source the API uses: the copy first, APIA for what the copy doesn't hold (another
   county, a bloc newer than the import) or when the copy can't be read (not imported yet). The copy is
   public reference data, so it is read with the service client: the route is signed-in only anyway. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { lpisTileBox, PlotGeometrySchema, PositionSchema, type LpisBloc, type LpisCommune, type Position } from '@cropcash/shared';
import { z } from 'zod';
import type { LpisSource } from './client';

const Bloc = z.object({
  fbid: z.string(),
  siruta: z.number().int(),
  bloc: z.string(),
  county: z.string().nullable(),
  commune: z.string().nullable(),
  landUse: z.string().nullable(),
  netAreaAri: z.number().int().nullable(),
  geometry: PlotGeometrySchema,
  uatSiruta: z.number().int().nullable(),
  villageSiruta: z.number().int().nullable(),
  villageMethod: z.enum(['only_village', 'inside_locality', 'nearest', 'paper']).nullable(),
  villageDistanceM: z.number().int().nullable(),
});

/** A bloc from the copy; one that doesn't parse (a MultiPolygon too big, say) counts as not there. */
const toBloc = (raw: unknown): LpisBloc | null => {
  const p = Bloc.safeParse(raw);
  return p.success ? p.data : null;
};

/** The copy's answers. Throws when the copy can't be read (migration 034 not applied, network). */
export function dbLpisSource(sb: Pick<SupabaseClient, 'rpc'>): LpisSource {
  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }
  return {
    async bloc(siruta, bloc) {
      return toBloc(await call<unknown>('lpis_bloc', { p_siruta: siruta, p_bloc: bloc }));
    },
    async at([lng, lat]) {
      const list = await call<unknown[]>('lpis_blocs_at', { p_lng: lng, p_lat: lat });
      return (list ?? []).map(toBloc).filter((b): b is LpisBloc => !!b);
    },
    async communes(county) {
      const list = await call<unknown[]>('siruta_communes', { p_county: county });
      return z.array(z.object({ siruta: z.number().int(), name: z.string() })).parse(list ?? []) as LpisCommune[];
    },
    async communeCentre(siruta) {
      const c = PositionSchema.safeParse(await call<unknown>('siruta_commune_centre', { p_siruta: siruta }));
      return c.success ? (c.data as Position) : null;
    },
    async tile(t) {
      const b = lpisTileBox(t);
      const list = await call<unknown[]>('lpis_blocs_in', { p_west: b.west, p_south: b.south, p_east: b.east, p_north: b.north });
      return (list ?? []).map(toBloc).filter((x): x is LpisBloc => !!x);
    },
  };
}

/**
 * The copy first, then APIA. An empty answer from the copy asks APIA too, since the copy holds only
 * the counties imported; a failure of the copy is logged once and APIA answers.
 */
export function localFirst(local: LpisSource, remote: LpisSource, warn: (msg: string) => void = (m) => console.warn('[lpis]', m)): LpisSource {
  let warned = false;
  async function first<T>(fromLocal: () => Promise<T>, useful: (v: T) => boolean, fromRemote: () => Promise<T>): Promise<T> {
    try {
      const v = await fromLocal();
      if (useful(v)) return v;
    } catch (e) {
      if (!warned) warn(`local copy unavailable, asking APIA: ${(e as Error).message}`);
      warned = true;
    }
    return fromRemote();
  }
  return {
    bloc: (s, b) => first(() => local.bloc(s, b), (v) => v !== null, () => remote.bloc(s, b)),
    at: (p) => first(() => local.at(p), (v) => v.length > 0, () => remote.at(p)),
    communes: (c) => first(() => local.communes(c), (v) => v.length > 0, () => remote.communes(c)),
    communeCentre: (s) => first(() => local.communeCentre(s), (v) => v !== null, () => remote.communeCentre(s)),
    tile: (t) => first(() => local.tile(t), (v) => v.length > 0, () => remote.tile(t)),
  };
}
