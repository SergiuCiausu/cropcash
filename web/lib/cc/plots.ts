/* Parcels from the API (docs/harta-plan.md, step 3). Loading and saving both need the internet: the
   map page keeps the last copy for offline (step 8), and the review sheet's button is a NetButton. */
import type { FarmPlots, PlotInput } from '../../../packages/shared/src/plots/index';
import { newIntentKey } from '../live/intent';
import type { LiveCalls } from './store';

export type { FarmPlots };

/** Every parcel and season, and the operations of `year` (all years without one). */
export function loadPlots(live: Pick<LiveCalls, 'api'>, year?: number): Promise<FarmPlots> {
  return live.api<FarmPlots>(year === undefined ? '/api/plots' : `/api/plots?year=${year}`);
}

/**
 * The review sheet's onSave. One key per tap, so a repeat after a lost answer gets the first answer
 * instead of making the parcels twice.
 */
export async function savePlots(live: Pick<LiveCalls, 'write'>, harvestYear: number, plots: PlotInput[], key = newIntentKey()): Promise<string[]> {
  const { ids } = await live.write<{ ids: string[] }>('save_plots', { harvestYear, plots }, { key });
  return ids;
}
