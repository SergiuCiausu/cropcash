/* What the list, the map and the card show for each parcel in one year, built once from the stored
   rows, plus the "Pe culturi" view grouped from the same rows. */
import type { StoredTransaction } from '../farm/plan-inputs';
import type { Bani } from '../money';
import type { OperationTemplate, StoredOperation, StoredPlot, StoredSeason } from './model';
import { plotsMoney, type PlotMoney } from './money';
import { operationsStatus, type OperationsStatus } from './operations';
import { expectedHarvest, sowingOf, type CropMonths, type HarvestInfo, type SowingInfo } from './season';

export interface PlotRow {
  plot: StoredPlot;
  /** This year's season; null when nothing grows on it this year. */
  season: StoredSeason | null;
  /** The season the year before, for "crop changed" and the history line. */
  previous: StoredSeason | null;
  sowing: SowingInfo | null;
  harvest: HarvestInfo | null;
  money: PlotMoney | null;
  operations: OperationsStatus;
}

export interface PlotRowsInput {
  year: number;
  today: string;
  plots: readonly StoredPlot[];
  seasons: readonly StoredSeason[];
  operations: readonly StoredOperation[];
  transactions: readonly (Pick<StoredTransaction, 'kind' | 'category' | 'crop_id' | 'amount_bani' | 'occurred_at' | 'harvest_year'> & {
    plot_id?: string | null;
  })[];
  crops: readonly CropMonths[];
  /** parcels.planted_month by crop, from the farm plan. */
  plannedMonths?: Readonly<Record<string, string | null | undefined>>;
  templates?: readonly OperationTemplate[];
  /** Archived parcels are left out unless asked for. */
  includeArchived?: boolean;
}

export function buildPlotRows(input: PlotRowsInput): PlotRow[] {
  const { year, today, crops } = input;
  const money = plotsMoney(year, input.seasons, input.transactions, crops);
  const seasonOf = new Map(input.seasons.map((s) => [`${s.plot_id}|${s.harvest_year}`, s]));
  const cropOf = new Map(crops.map((c) => [c.id, c]));
  return input.plots
    .filter((p) => input.includeArchived || !p.archived_at)
    .map((plot) => {
      const season = seasonOf.get(`${plot.id}|${year}`) ?? null;
      const crop = season?.crop_id ? cropOf.get(season.crop_id) : undefined;
      const templates = (input.templates ?? []).filter((t) => t.crop_id === season?.crop_id);
      return {
        plot,
        season,
        previous: seasonOf.get(`${plot.id}|${year - 1}`) ?? null,
        sowing: season ? sowingOf(season, crop, season.crop_id ? input.plannedMonths?.[season.crop_id] : null) : null,
        harvest: season ? expectedHarvest(season, crop, today) : null,
        money: money.get(plot.id) ?? null,
        operations: operationsStatus(plot.id, year, input.operations, season ? templates : [], today),
      };
    });
}

/** The crop key a row is grouped and filtered under. */
export const UNKNOWN_CROP = 'unknown';
export const cropKeyOf = (row: PlotRow) => row.season?.crop_id ?? UNKNOWN_CROP;

export interface CropGroup {
  cropId: string;
  plotIds: string[];
  areaAri: number;
  expenses: Bani;
  revenue: Bani;
  result: Bani;
  perHa: { expenses: Bani; revenue: Bani; result: Bani } | null;
}

/** "Pe culturi": rows with a season this year, grouped by crop, largest area first. */
export function cropGroups(rows: readonly PlotRow[]): CropGroup[] {
  const groups = new Map<string, CropGroup>();
  for (const row of rows) {
    if (!row.season) continue;
    const key = cropKeyOf(row);
    const g = groups.get(key) ?? { cropId: key, plotIds: [], areaAri: 0, expenses: 0, revenue: 0, result: 0, perHa: null };
    g.plotIds.push(row.plot.id);
    g.areaAri += row.season.area_ari;
    g.expenses += row.money?.expenses.total ?? 0;
    g.revenue += row.money?.revenue.total ?? 0;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const result = g.revenue - g.expenses;
      const per = (b: Bani) => Math.round((b * 100) / g.areaAri);
      return { ...g, result, perHa: g.areaAri > 0 ? { expenses: per(g.expenses), revenue: per(g.revenue), result: per(result) } : null };
    })
    .sort((a, b) => b.areaAri - a.areaAri || a.cropId.localeCompare(b.cropId));
}
