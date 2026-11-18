/* Which village a bloc fizic points to (docs/harta-plan.md, step 1b). LPIS ties a bloc to a code, usually
   the commune's, and never says which village it lies by, so it is worked out, in this order:
   - paper: the farmer's own cerere names the village („Localitate: comună și sat”), which wins for that
     farmer's parcel;
   - only_village: the commune has one village;
   - inside_locality: the bloc touches the built-up outline of one of the commune's villages;
   - nearest: the commune's village nearest to the bloc's middle, with the distance, never said as fact.
   Pure. The import script runs the same rules in SQL for every bloc of a county. */
import { centroid, containsPoint, overlapRatio } from './geometry';
import type { PlotGeometry, Position } from './model';
import { localitiesOf, placeLabel, type Place } from './siruta';

export const VILLAGE_METHODS = ['only_village', 'inside_locality', 'nearest', 'paper'] as const;
export type VillageMethod = (typeof VILLAGE_METHODS)[number];

export interface VillagePick {
  siruta: number;
  method: VillageMethod;
  /** From the bloc's middle to the village's point, in metres; 0 inside it, null when its point isn't known. */
  distanceM: number | null;
}

const EARTH_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM([lng1, lat1]: Position, [lng2, lat2]: Position): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A village's built-up outline (OSM place area or residential land around its point). */
export interface LocalityArea {
  siruta: number;
  geometry: PlotGeometry;
}

/**
 * The village for a bloc of the commune `commune`, by the rules above (without `paper`, which is the
 * farmer's own and belongs to a parcel, see plotVillage). Null when the commune has no villages known.
 */
export function villageForBloc(bloc: { commune: number; geometry: PlotGeometry }, places: readonly Place[], areas: readonly LocalityArea[] = []): VillagePick | null {
  const villages = localitiesOf(bloc.commune, places);
  if (!villages.length) return null;
  const middle = centroid(bloc.geometry);
  const away = (v: Place) => (v.at ? Math.round(distanceM(middle, v.at)) : null);
  if (villages.length === 1) {
    const v = villages[0]!;
    const inside = v.at && containsPoint(bloc.geometry, v.at);
    return { siruta: v.siruta, method: 'only_village', distanceM: inside ? 0 : away(v) };
  }
  const ids = new Set(villages.map((v) => v.siruta));
  const touched = areas.filter((a) => ids.has(a.siruta) && overlapRatio(bloc.geometry, a.geometry) > 0);
  if (touched.length === 1) return { siruta: touched[0]!.siruta, method: 'inside_locality', distanceM: 0 };
  /* Two built-up areas touch it: the nearer of those two. None: the nearer of all. */
  const pool = touched.length > 1 ? villages.filter((v) => touched.some((t) => t.siruta === v.siruta)) : villages;
  const ranked = pool.filter((v) => v.at).map((v) => ({ v, d: distanceM(middle, v.at!) })).sort((a, b) => a.d - b.d);
  const best = ranked[0];
  if (!best) return null;
  return { siruta: best.v.siruta, method: touched.length > 1 ? 'inside_locality' : 'nearest', distanceM: touched.length > 1 ? 0 : Math.round(best.d) };
}

/** A parcel's village: the one its cerere names wins over the one worked out for its bloc. */
export function plotVillage(paperSiruta: number | null | undefined, blocPick: VillagePick | null): VillagePick | null {
  return paperSiruta ? { siruta: paperSiruta, method: 'paper', distanceM: null } : blocPick;
}

/** „1,2 km” or „800 m”, as the app says a distance. */
export function distanceText(m: number): string {
  if (m < 1000) return `${Math.max(100, Math.round(m / 100) * 100)} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('ro-RO')} km`;
}

/**
 * The words for where a parcel is: „satul Măldăeni, comuna Măldăeni” when it's known, „lângă satul
 * Butculești (1,2 km), comuna Măldăeni” when it's only the nearest village, or just the commune.
 */
export function whereText(commune: number | null, pick: VillagePick | null, byCode: ReadonlyMap<number, Place>): string | null {
  if (pick && pick.method === 'nearest') {
    const v = byCode.get(pick.siruta);
    const unit = v?.commune ? byCode.get(v.commune) : undefined;
    if (v && unit) {
      const far = pick.distanceM != null && pick.distanceM > 0 ? ` (${distanceText(pick.distanceM)})` : '';
      return `lângă ${v.kind === 'village' ? 'satul ' : ''}${v.name}${far}, ${placeLabel(unit.siruta, byCode)}`;
    }
  }
  if (pick) {
    const label = placeLabel(pick.siruta, byCode);
    if (label) return label;
  }
  return commune ? placeLabel(commune, byCode) : null;
}

/** Where a bloc is, as the API answers it next to the bloc. */
export interface BlocPlace {
  village: { siruta: number; name: string } | null;
  commune: { siruta: number; name: string; kind: Place['kind'] } | null;
  county: string | null;
  method: VillageMethod | null;
  distanceM: number | null;
  /** „satul Măldăeni, comuna Măldăeni” or „lângă satul X (1,2 km), comuna Y”. */
  text: string | null;
}

/**
 * The place of a bloc: the village the local copy worked out (lpis_blocs), else the same rules run here
 * on its outline. A bloc outside the counties in `byCode` gets only its county.
 */
export function blocPlace(bloc: { siruta: number; county: string | null; geometry: PlotGeometry; uatSiruta?: number | null; villageSiruta?: number | null; villageMethod?: VillageMethod | null; villageDistanceM?: number | null }, byCode: ReadonlyMap<number, Place>): BlocPlace {
  const commune = bloc.uatSiruta ?? byCode.get(bloc.siruta)?.commune ?? null;
  const pick: VillagePick | null =
    bloc.villageSiruta && bloc.villageMethod
      ? { siruta: bloc.villageSiruta, method: bloc.villageMethod, distanceM: bloc.villageDistanceM ?? null }
      : commune
        ? villageForBloc({ commune, geometry: bloc.geometry }, [...byCode.values()])
        : null;
  const v = pick ? byCode.get(pick.siruta) : undefined;
  const c = commune ? byCode.get(commune) : undefined;
  return {
    village: v ? { siruta: v.siruta, name: v.name } : null,
    commune: c ? { siruta: c.siruta, name: c.name, kind: c.kind } : null,
    county: c?.county ?? bloc.county,
    method: v ? pick!.method : null,
    distanceM: v ? pick!.distanceM : null,
    text: whereText(commune, v ? pick : null, byCode),
  };
}
