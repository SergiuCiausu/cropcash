/* The land reports: which parcel holds what in a harvest year (for the town hall's farm register,
   docs/04-farmer-reports.md §4), and the plant-protection treatments done on them (§2). From the
   farm's parcels (migration 020), as /harta shows them. */
import { TREATMENT_KINDS, type StoredOperation, type StoredPlot, type StoredSeason } from '../plots/model';
import type { FarmPlots } from '../plots/wire';
import { inPeriod, type Period } from './period';

export interface LandRow {
  plot: StoredPlot;
  season: StoredSeason;
}

const byName = (a: LandRow, b: LandRow) =>
  (a.season.crop_id ?? '').localeCompare(b.season.crop_id ?? '') || (a.plot.name ?? '').localeCompare(b.plot.name ?? '') || a.plot.id.localeCompare(b.plot.id);

/** Each parcel in use in `year`, by crop, and the hectares on each crop. */
export function landOf(fp: Pick<FarmPlots, 'plots' | 'seasons'>, year: number) {
  const plots = new Map(fp.plots.filter((p) => !p.archived_at).map((p) => [p.id, p]));
  const rows: LandRow[] = fp.seasons
    .filter((s) => s.harvest_year === year && s.area_ari > 0 && plots.has(s.plot_id))
    .map((season) => ({ plot: plots.get(season.plot_id)!, season }))
    .sort(byName);
  const crops = new Map<string | null, number>();
  for (const r of rows) crops.set(r.season.crop_id, (crops.get(r.season.crop_id) ?? 0) + r.season.area_ari);
  return {
    rows,
    crops: [...crops].map(([cropId, ari]) => ({ cropId, ari })).sort((a, b) => b.ari - a.ari),
    totalAri: rows.reduce((s, r) => s + r.season.area_ari, 0),
  };
}

export interface TreatmentRow {
  operation: StoredOperation;
  plot: StoredPlot | null;
  /** The parcel's season in the operation's harvest year, for the crop and the area. */
  season: StoredSeason | null;
}

/**
 * The treatments done in a period, oldest first. A harvest year takes the operations filed under it;
 * other periods go by the day it was done. A treatment with no day only counts for its harvest year.
 */
export function treatmentsOf(fp: FarmPlots, period: Period): TreatmentRow[] {
  const plots = new Map(fp.plots.map((p) => [p.id, p]));
  const inside = (o: StoredOperation) => (period.kind === 'harvest' ? o.harvest_year === +period.key : !!o.on_date && inPeriod(o.on_date, period));
  return fp.operations
    .filter((o) => o.status === 'done' && TREATMENT_KINDS.includes(o.kind) && inside(o))
    .map((operation) => ({
      operation,
      plot: plots.get(operation.plot_id) ?? null,
      season: fp.seasons.find((s) => s.plot_id === operation.plot_id && s.harvest_year === operation.harvest_year) ?? null,
    }))
    .sort((a, b) => (a.operation.on_date ?? '9999').localeCompare(b.operation.on_date ?? '9999') || a.operation.id.localeCompare(b.operation.id));
}
