/* A new parcel drawn by hand on /harta (docs/harta-plan.md, „Desenează o parcelă”): what is sent to
   save_plots, and what happens to the crop's hectares that weren't on the map yet. save_plots (SQL) takes a
   crop's newly placed hectares out of its unplaced parcel first; this says the same thing before saving. */
import { isFbid, type LpisBloc } from './lpis';
import type { PlotGeometry, PlotInput, Shape } from './model';

export interface DrawnPlot {
  name: string;
  county: string;
  shape: Shape;
  geometry: PlotGeometry;
  areaAri: number;
  /** What grows on it in the year saved; null for nothing sown yet. */
  cropId: string | null;
  /** The APIA bloc it was drawn in, when it was started from one. */
  bloc?: Pick<LpisBloc, 'fbid' | 'siruta' | 'bloc' | 'landUse'> | null;
}

/** The save_plots row for a parcel drawn from nothing. Null when the drawing has no area to save. */
export function drawnPlotInput(p: DrawnPlot): PlotInput | null {
  const areaAri = Math.round(p.areaAri);
  if (!(areaAri > 0)) return null;
  const name = p.name.trim().slice(0, 80);
  return {
    name: name || null,
    county: p.county,
    shape: p.shape,
    geometry: p.geometry,
    geometrySource: 'drawn',
    ...(p.bloc && isFbid(p.bloc.fbid)
      ? { lpisFbid: p.bloc.fbid, siruta: p.bloc.siruta, blocFizic: p.bloc.bloc.slice(0, 20), ...(p.bloc.landUse ? { landUse: p.bloc.landUse.slice(0, 10) } : {}) }
      : {}),
    season: { cropId: p.cropId, areaAri },
  };
}

export type UnplacedChange =
  /** Part of the crop's unplaced hectares get a place; `leftAri` stay without one. */
  | { kind: 'shrinks'; leftAri: number }
  /** Exactly what was unplaced: the crop is now all on the map. */
  | { kind: 'all' }
  /** More than was unplaced: the crop's area in the plan grows by `moreAri`. */
  | { kind: 'grows'; moreAri: number };

/**
 * What a new parcel of `drawnAri` does to its crop's hectares not on the map (`unplacedAri`, 0 when the crop
 * has none). Null without a crop, or for a year other than the plan's, where save_plots changes no totals.
 */
export function unplacedChange(drawnAri: number, unplacedAri: number, cropId: string | null, planYear: boolean): UnplacedChange | null {
  if (!cropId || !planYear || !(drawnAri > 0)) return null;
  if (drawnAri < unplacedAri) return { kind: 'shrinks', leftAri: unplacedAri - drawnAri };
  if (drawnAri === unplacedAri) return { kind: 'all' };
  return { kind: 'grows', moreAri: drawnAri - unplacedAri };
}
