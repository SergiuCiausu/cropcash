/* Place names for the app (docs/harta-plan.md, step 1b): „satul Măldăeni, comuna Măldăeni” instead of a
   SIRUTA code. Read from docs/data/siruta-tr-ct.json, which ships with the app, so it works offline and on
   Ion's farm. A code outside Teleorman and Constanța falls back to „SIRUTA <code>”. */
import { placeLabel, placesTrCt as places, plotVillage, villageForBloc, whereText, type PlotGeometry } from '@cropcash/shared';

/** The readable name of a code: „comuna Măldăeni”, „satul Măldăeni, comuna Măldăeni”. */
export const placeName = (siruta: number) => placeLabel(siruta, places()) ?? `SIRUTA ${siruta}`;

/**
 * Where a parcel is: the village its cerere names (village_siruta), else the one worked out from its
 * outline („lângă satul X (1,2 km)” when it's only the nearest), else its commune.
 */
export function plotPlace(plot: { siruta: number | null; village_siruta?: number | null; geometry?: PlotGeometry | null }): string | null {
  const all = places();
  const own = plot.siruta ? all.get(plot.siruta) : undefined;
  const commune = own ? own.commune : null;
  const computed = commune && plot.geometry ? villageForBloc({ commune, geometry: plot.geometry }, [...all.values()]) : null;
  const text = whereText(commune ?? plot.siruta, plotVillage(plot.village_siruta, computed), all);
  return text ?? (plot.siruta ? `SIRUTA ${plot.siruta}` : null);
}
