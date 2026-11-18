/* The farm plan still thinks in crops (parcels: one row per crop). Those totals and the parcels must
   agree in the plan's harvest year. Same rules as sync_unplaced_plots and save_plots in
   supabase/migrations/020_plots.sql, for the places that don't call the API (Ion's farm, offline).

   - Hectares of a crop not yet on the map sit on one "unplaced" parcel per crop (auto_crop_id).
   - Editing the crop totals (onboarding, "Date plan") only moves those unplaced hectares. A total
     smaller than what's already on the map is refused: the farmer changes the map instead.
   - Putting a crop's parcel on the map takes its hectares from the unplaced ones first. */
import type { StoredPlot, StoredSeason } from './model';

export type CropTotals = Record<string, number>;
export type TotalsIssue = { kind: 'below_mapped'; cropId: string } | { kind: 'removed_but_mapped'; cropId: string };

export interface PlotsState {
  plots: StoredPlot[];
  seasons: StoredSeason[];
}

const placed = (state: PlotsState, year: number) => {
  const auto = new Set(state.plots.filter((p) => p.auto_crop_id).map((p) => p.id));
  const sum: CropTotals = {};
  for (const s of state.seasons)
    if (s.harvest_year === year && s.crop_id && !auto.has(s.plot_id)) sum[s.crop_id] = (sum[s.crop_id] ?? 0) + s.area_ari;
  return sum;
};

/** Crop totals in a year: what the farm plan's parcels hold. */
export function cropTotals(seasons: readonly StoredSeason[], year: number): CropTotals {
  const out: CropTotals = {};
  for (const s of seasons) if (s.harvest_year === year && s.crop_id) out[s.crop_id] = (out[s.crop_id] ?? 0) + s.area_ari;
  return out;
}

/**
 * Make the year's parcels add up to `targets` (crop → ari) by changing only the unplaced ones.
 * `newId` names an unplaced parcel the first time a crop needs one.
 */
export function syncUnplaced(
  state: PlotsState,
  year: number,
  targets: CropTotals,
  county: string,
  newId: (cropId: string) => string,
): { state: PlotsState; issues: TotalsIssue[] } {
  const onMap = placed(state, year);
  const issues: TotalsIssue[] = [];
  for (const [cropId, ari] of Object.entries(onMap)) {
    if (!(cropId in targets) && ari > 0) issues.push({ kind: 'removed_but_mapped', cropId });
    else if ((targets[cropId] ?? 0) < ari) issues.push({ kind: 'below_mapped', cropId });
  }
  if (issues.length) return { state, issues };

  const plots = [...state.plots];
  const autoFor = new Map(plots.filter((p) => p.auto_crop_id).map((p) => [p.auto_crop_id!, p]));
  let seasons = state.seasons.filter((s) => !(s.harvest_year === year && [...autoFor.values()].some((p) => p.id === s.plot_id)));

  for (const [cropId, ari] of Object.entries(targets)) {
    const left = ari - (onMap[cropId] ?? 0);
    if (left <= 0) continue;
    let auto = autoFor.get(cropId);
    if (!auto) {
      auto = unplacedPlot(newId(cropId), cropId, county);
      plots.push(auto);
      autoFor.set(cropId, auto);
    }
    seasons.push(emptySeason(auto.id, year, cropId, left));
  }
  // An unplaced parcel with no season left in any year has nothing to show.
  const used = new Set(seasons.map((s) => s.plot_id));
  const kept = plots.filter((p) => !p.auto_crop_id || used.has(p.id));
  seasons = seasons.filter((s) => kept.some((p) => p.id === s.plot_id));
  return { state: { plots: kept, seasons }, issues: [] };
}

/**
 * After the farmer saved parcels on the map: each crop's newly placed hectares come out of its
 * unplaced parcel first. Returns the new state; the crop totals follow from it (cropTotals).
 */
export function absorbPlaced(before: PlotsState, after: PlotsState, year: number): PlotsState {
  const was = placed(before, year);
  const now = placed(after, year);
  const autoIds = new Map(after.plots.filter((p) => p.auto_crop_id).map((p) => [p.id, p.auto_crop_id!]));
  const seasons: StoredSeason[] = [];
  for (const s of after.seasons) {
    const cropId = autoIds.get(s.plot_id);
    if (s.harvest_year !== year || !cropId) {
      seasons.push(s);
      continue;
    }
    const grown = (now[cropId] ?? 0) - (was[cropId] ?? 0);
    const left = grown > 0 ? s.area_ari - grown : s.area_ari;
    if (left > 0) seasons.push({ ...s, area_ari: left });
  }
  const used = new Set(seasons.map((s) => s.plot_id));
  return { plots: after.plots.filter((p) => !p.auto_crop_id || used.has(p.id)), seasons };
}

export function unplacedPlot(id: string, cropId: string, county: string): StoredPlot {
  return {
    id,
    name: null,
    county,
    siruta: null,
    village_siruta: null,
    bloc_fizic: null,
    parcel_no: null,
    lpis_fbid: null,
    land_use: null,
    geometry: null,
    shape: null,
    centroid_lat: null,
    centroid_lng: null,
    geometry_source: 'none',
    auto_crop_id: cropId,
    archived_at: null,
  };
}

const emptySeason = (plotId: string, year: number, cropId: string, ari: number): StoredSeason => ({
  plot_id: plotId,
  harvest_year: year,
  crop_id: cropId,
  apia_crop_code: null,
  area_ari: ari,
  sown_on: null,
  harvested_on: null,
  second_crop_id: null,
});
