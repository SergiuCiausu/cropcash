/* Finding the parcels of a paper on the map (docs/harta-plan.md, step 4): the bloc from APIA, else the
   middle of the UAT. APIA can take a few seconds per question, so rows are looked up a few at a time in
   the background and reported one by one. A failure only means "place it later": it never blocks saving.
   Needs the internet; offline, every row says so. */
import {
  placeParcel,
  type LpisBloc,
  type LpisCommune,
  type MapPlacement,
  type PaperPlot,
  type Position,
} from '../../../packages/shared/src/plots/index';
import { ApiError } from '../live/client';
import type { LiveCalls } from './store';

type Api = Pick<LiveCalls, 'api'>;

/** Where a row of the paper is in the lookup. */
export type RowLocation = { status: 'looking' } | { status: 'found'; placement: MapPlacement } | { status: 'failed'; offline: boolean };

const missing = (e: unknown) => e instanceof ApiError && e.status === 404;

/** The bloc, or null when APIA has none with that number. Throws when APIA can't be asked. */
export async function findBloc(live: Api, siruta: number, bloc: string): Promise<LpisBloc | null> {
  try {
    return (await live.api<{ bloc: LpisBloc }>(`/api/lpis/bloc?siruta=${siruta}&bloc=${encodeURIComponent(bloc)}`)).bloc;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** The middle of a UAT's blocs, or null. */
export async function communeCentre(live: Api, siruta: number): Promise<Position | null> {
  try {
    return (await live.api<{ centre: Position }>(`/api/siruta/${siruta}/centre`)).centre;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** The blocs under a point, for „Sunt aici acum” and a tap on the map. */
export async function blocsAt(live: Api, [lng, lat]: Position): Promise<LpisBloc[]> {
  return (await live.api<{ blocs: LpisBloc[] }>(`/api/lpis/at?lng=${lng.toFixed(6)}&lat=${lat.toFixed(6)}`)).blocs;
}

/** A county's UATs matching `q` (all of them without one), ignoring diacritics. */
export async function searchUats(live: Api, county: string, q = ''): Promise<LpisCommune[]> {
  const query = q ? `&q=${encodeURIComponent(q)}` : '';
  return (await live.api<{ communes: LpisCommune[] }>(`/api/siruta?county=${encodeURIComponent(county)}${query}`)).communes;
}

/** One row: the bloc, else the UAT's middle, else nothing. */
export async function locatePaperPlot(live: Api, p: PaperPlot, warnPct: number): Promise<MapPlacement> {
  const bloc = p.siruta !== null && p.blocFizic ? await findBloc(live, p.siruta, p.blocFizic) : null;
  const centre = !bloc && p.siruta !== null ? await communeCentre(live, p.siruta) : null;
  return placeParcel(p.areaAri, bloc, centre, warnPct);
}

/**
 * Looks up every row, `concurrency` at a time, calling `onRow` as each one starts and ends. Rows of the
 * same bloc share one question. `isCancelled` stops it between rows when the sheet closes.
 */
export async function locatePaperPlots(
  live: Api,
  plots: readonly PaperPlot[],
  options: { warnPct: number; onRow: (row: number, location: RowLocation) => void; isOnline: () => boolean; isCancelled?: () => boolean; concurrency?: number },
): Promise<void> {
  const { warnPct, onRow, isOnline, isCancelled = () => false, concurrency = 3 } = options;
  /* Two rows of one bloc, or of one UAT, ask once. */
  const asked = new Map<string, Promise<unknown>>();
  const shared: Api = {
    api: <T,>(path: string) => {
      if (!asked.has(path)) asked.set(path, live.api<T>(path));
      return asked.get(path) as Promise<T>;
    },
  };
  const queue = [...plots];
  const worker = async () => {
    for (let p = queue.shift(); p && !isCancelled(); p = queue.shift()) {
      if (!isOnline()) {
        onRow(p.row, { status: 'failed', offline: true });
        continue;
      }
      onRow(p.row, { status: 'looking' });
      try {
        const placement = await locatePaperPlot(shared, p, warnPct);
        if (!isCancelled()) onRow(p.row, { status: 'found', placement });
      } catch (e) {
        if (!isCancelled()) onRow(p.row, { status: 'failed', offline: e instanceof ApiError && e.code === 'offline' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, plots.length) }, worker));
}
