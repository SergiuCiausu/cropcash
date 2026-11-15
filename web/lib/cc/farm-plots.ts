/* The parcels /harta shows (docs/harta-plan.md, step 8), wherever they come from:
   - a farm on the server: GET /api/plots, with the last answer kept on the phone for offline;
   - Ion's farm: his two real blocs in Măldăeni, from APIA's LPIS (docs/harta-plan.md, step 0);
   - a farm only on the phone: one unplaced parcel per crop, as onboarding makes on the server.
   Pure, apart from the copy kept on the phone. */
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import bloc293 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-293.json';
import { centroid, parseBlocs, unplacedPlot, type FarmPlots, type OperationKind, type StoredOperation, type StoredPlot, type StoredSeason } from '../../../packages/shared/src/plots/index';
import { harvestYear } from '../../../packages/shared/src/farm/harvests';
import demoIon from '../../../docs/data/demo-ion.json';
import type { Harvest } from './harvests';
import { toTransaction } from './harvests';
import { readJson, writeJson, type KeyStore } from './storage';

/** Where the last copy from the server is kept; the page passes it through storageKey. */
export const PLOTS_COPY_KEY = 'cropcash-plots';

export interface PlotsCopy {
  plots: FarmPlots;
  /** When it came from the server (ISO time). */
  at: string;
}

/** True for an answer shaped like GET /api/plots. */
export const isFarmPlots = (p: unknown): p is FarmPlots =>
  !!p && Array.isArray((p as FarmPlots).plots) && Array.isArray((p as FarmPlots).seasons) && Array.isArray((p as FarmPlots).operations);

export function readPlotsCopy(store: KeyStore, key: string): PlotsCopy | null {
  const c = readJson<PlotsCopy>(store, key);
  return c && isFarmPlots(c.plots) ? c : null;
}
export const savePlotsCopy = (store: KeyStore, key: string, plots: FarmPlots, at: string) => writeJson(store, key, { plots, at } satisfies PlotsCopy);

const season = (plotId: string, year: number, cropId: string, ari: number): StoredSeason => ({
  plot_id: plotId,
  harvest_year: year,
  crop_id: cropId,
  apia_crop_code: null,
  area_ari: ari,
  sown_on: null,
  harvested_on: null,
  second_crop_id: null,
});

/** One parcel per crop with no place on the map yet, for a farm that isn't on the server. */
export function unplacedFarmPlots(parcels: readonly { cropId: string; areaHa: number }[], county: string, year: number): FarmPlots {
  return {
    plots: parcels.map((p) => unplacedPlot(`local-${p.cropId}`, p.cropId, county)),
    seasons: parcels.map((p) => season(`local-${p.cropId}`, year, p.cropId, Math.round(p.areaHa * 100))),
    operations: [],
  };
}

/** Ion's blocs, in the order of his crops in docs/data/demo-ion.json: wheat on 286, maize on 293. */
const ION_BLOCS = [bloc286, bloc293];

/** The harvest year Ion's demo work belongs to: the one under way on the demo's first day. */
export const ION_WORK_YEAR = harvestYear(demoIon.demo_start.value);

/** Ion's work on his parcels, as written in docs/data/demo-ion.json (plot_work: demo examples, P9). */
export function ionOperations(plotIdOf: (cropId: string) => string | null): StoredOperation[] {
  return demoIon.plot_work.operations.flatMap((o) => {
    const plotId = plotIdOf(o.crop_id);
    if (!plotId) return [];
    return [{ id: o.id, plot_id: plotId, harvest_year: ION_WORK_YEAR, kind: o.kind as OperationKind, status: o.status as 'done' | 'planned', on_date: o.on_date, product: null, dose: null, note: null, transaction_id: null, template_id: null }];
  });
}
const ionSownOn = (cropId: string) => (demoIon.plot_work.sown_on as Record<string, string | undefined>)[cropId] ?? null;

/**
 * Ion's farm: each crop on one of his real blocs, with the hectares he declares, and the demo work
 * from docs/data/demo-ion.json in the year it belongs to.
 */
export function ionPlots(parcels: readonly { cropId: string; areaHa: number }[], year: number): FarmPlots {
  const plots: StoredPlot[] = [];
  const seasons: StoredSeason[] = [];
  parcels.forEach((p, i) => {
    const [bloc] = ION_BLOCS[i] ? parseBlocs(ION_BLOCS[i]) : [];
    const id = `ion-${p.cropId}`;
    const centre = bloc ? centroid(bloc.geometry) : null;
    plots.push({
      ...unplacedPlot(id, p.cropId, 'TR'),
      auto_crop_id: bloc ? null : p.cropId,
      ...(bloc
        ? {
            siruta: bloc.siruta,
            bloc_fizic: bloc.bloc,
            lpis_fbid: bloc.fbid,
            land_use: bloc.landUse,
            geometry: bloc.geometry,
            geometry_source: 'lpis' as const,
            centroid_lng: centre?.[0] ?? null,
            centroid_lat: centre?.[1] ?? null,
          }
        : {}),
    });
    seasons.push({ ...season(id, year, p.cropId, Math.round(p.areaHa * 100)), sown_on: year === ION_WORK_YEAR ? ionSownOn(p.cropId) : null });
  });
  const operations = year === ION_WORK_YEAR ? ionOperations((cropId) => (parcels.some((p) => p.cropId === cropId) ? `ion-${cropId}` : null)) : [];
  return { plots, seasons, operations };
}

/** The farm's own sales and expenses, as plotsMoney reads them. Records off the server carry their harvest. */
export function farmTransactions(me: { transactions?: unknown[] } | null, harvests: readonly Harvest[] | undefined) {
  type Tx = ReturnType<typeof toTransaction> & { harvest_year?: number | null; plot_id?: string | null };
  if (me) return (me.transactions ?? []) as Tx[];
  return (harvests ?? []).flatMap((h) => h.records.filter((r) => r.kind === 'sale' || r.kind === 'expense').map((r): Tx => ({ ...toTransaction(r), harvest_year: h.year })));
}
