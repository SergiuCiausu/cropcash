/* Rows read from a new cerere against the parcels the farm already has, so next year's paper adds a
   season to the same piece of land instead of a second copy of it. */
import { overlapRatio } from './geometry';
import type { PlotGeometry, StoredPlot } from './model';

export interface SeasonRow {
  siruta: number | null;
  blocFizic: string | null;
  parcelNo: string | null;
  geometry?: PlotGeometry | null;
}

export type RowMatch =
  | { kind: 'same'; plotId: string }
  /** The shape overlaps an existing parcel but the numbers differ: the farmer confirms. */
  | { kind: 'ask'; plotId: string; overlap: number }
  | { kind: 'new' };

const norm = (s: string | null) => s?.trim().toLowerCase().replace(/\s+/g, '') ?? null;

/**
 * Same SIRUTA, bloc and parcel number → the same parcel. Otherwise a shape that covers at least
 * `minOverlap` of an existing parcel's → ask. A parcel is matched to one row at most; numbers win
 * over shapes. Only live parcels the farmer placed themself count, never the per-crop leftovers.
 */
export function matchSeasonRows(rows: readonly SeasonRow[], plots: readonly StoredPlot[], minOverlap: number): RowMatch[] {
  const live = plots.filter((p) => !p.archived_at && !p.auto_crop_id);
  const taken = new Set<string>();
  const out: RowMatch[] = rows.map(() => ({ kind: 'new' }));

  rows.forEach((row, i) => {
    if (row.siruta == null || !row.blocFizic || !row.parcelNo) return;
    const hit = live.find(
      (p) => !taken.has(p.id) && p.siruta === row.siruta && norm(p.bloc_fizic) === norm(row.blocFizic) && norm(p.parcel_no) === norm(row.parcelNo),
    );
    if (hit) {
      taken.add(hit.id);
      out[i] = { kind: 'same', plotId: hit.id };
    }
  });

  rows.forEach((row, i) => {
    if (out[i]!.kind !== 'new' || !row.geometry) return;
    let best: { id: string; overlap: number } | null = null;
    for (const p of live) {
      if (taken.has(p.id) || !p.geometry) continue;
      const overlap = overlapRatio(row.geometry, p.geometry);
      if (overlap >= minOverlap && (!best || overlap > best.overlap)) best = { id: p.id, overlap };
    }
    if (best) {
      taken.add(best.id);
      out[i] = { kind: 'ask', plotId: best.id, overlap: best.overlap };
    }
  });
  return out;
}
