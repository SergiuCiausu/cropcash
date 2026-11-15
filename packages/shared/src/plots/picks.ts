/* Money and reminders tied to a parcel (docs/harta-plan.md, step 10). */
import { TREATMENT_KINDS, type OperationKind, type StoredOperation, type StoredPlot, type StoredSeason } from './model';

/**
 * The parcels a sale or an expense can be put on: parcels in use with a season in that harvest year,
 * growing `cropId` (any crop when null). A parcel with nothing sown that year isn't offered: the money
 * would have no crop to count for.
 */
export function plotsForCrop(
  plots: readonly StoredPlot[],
  seasons: readonly StoredSeason[],
  harvestYear: number,
  cropId: string | null,
): StoredPlot[] {
  const growing = new Set(seasons.filter((s) => s.harvest_year === harvestYear && s.crop_id && (cropId === null || s.crop_id === cropId)).map((s) => s.plot_id));
  return plots.filter((p) => !p.archived_at && growing.has(p.id));
}

export interface UpcomingWork {
  operation: StoredOperation;
  /** Negative when the day has passed. */
  daysLeft: number;
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/**
 * Planned work to remind of: on a parcel in use, with a day that is at most `days` away or has passed.
 * Work without a day isn't a reminder. Soonest first, the late ones on top.
 */
export function upcomingWork(operations: readonly StoredOperation[], plots: readonly Pick<StoredPlot, 'id' | 'archived_at'>[], today: string, days: number): UpcomingWork[] {
  const live = new Set(plots.filter((p) => !p.archived_at).map((p) => p.id));
  return operations
    .filter((o) => o.status === 'planned' && o.on_date && live.has(o.plot_id))
    .map((operation) => ({ operation, daysLeft: dayNumber(operation.on_date!) - dayNumber(today) }))
    .filter((w) => w.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.operation.id.localeCompare(b.operation.id));
}

/** A treatment expense noted together with the work it paid for: the kind the farmer picked, done that day. */
export const isTreatmentKind = (kind: string): kind is OperationKind => (TREATMENT_KINDS as readonly string[]).includes(kind);
