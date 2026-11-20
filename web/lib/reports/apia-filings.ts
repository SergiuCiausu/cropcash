/* The APIA papers for one farm (docs/rapoarte-apia-plan.md §3.2): docs/data/apia-papers.json, the
   calendar and what the farm on the phone says about itself. Bundled data and the farm's own copy,
   so the list works offline and on Ion's farm. */
import papersJson from '../../../docs/data/apia-papers.json';
import { isFallow } from '../../../packages/shared/src/data/schemas';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import { apiaFacts, apiaFilings, ApiaPapersFileSchema, headCount, landOf, LivestockFileSchema, type Filing } from '../../../packages/shared/src/reports/index';
import livestockJson from '../../../docs/data/livestock.json';
import { shiftYears } from '../../../packages/shared/src/obligations/index';
import type { FarmState } from '../cc/farm';
import type { FarmView } from '../cc/plan';

/** docs/data/apia-papers.json, checked once. */
export const APIA_PAPERS = ApiaPapersFileSchema.parse(papersJson);
/** docs/data/livestock.json: the animal categories of the cerere, with their UVM. */
export const LIVESTOCK = LivestockFileSchema.parse(livestockJson);

/** The papers that apply to the farm, for the campaign `year` (the harvest year), with their deadlines. */
export function farmFilings(state: Pick<FarmState, 'harvests'> & Partial<Pick<FarmState, 'apiaAnswers' | 'livestock'>>, view: FarmView, plots: FarmPlots | null, year: number): Filing[] {
  const data = view.data();
  const items = state.harvests?.items ?? [];
  const parcels = items.find((h) => h.year === year)?.parcels ?? view.farm.parcels;
  const land = plots ? landOf(plots, year) : null;
  const yearAgo = shiftYears(view.today, -1);
  const facts = apiaFacts({
    landUses: land?.rows.map((r) => r.plot.land_use) ?? [],
    cropSections: parcels.filter((p) => p.areaHa > 0).map((p) => data.catalogue.find((c) => c.id === p.cropId)?.section ?? null),
    hasFallow: parcels.some((p) => isFallow(p.cropId)),
    dieselExpenses: items.flatMap((h) => h.records).filter((r) => r.kind === 'expense' && r.category === 'diesel' && r.date >= yearAgo).length,
    answers: state.apiaAnswers,
    heads: state.livestock ? headCount(LIVESTOCK, state.livestock) : null,
  });
  return apiaFilings(APIA_PAPERS, data.calendar, facts, view.today);
}
