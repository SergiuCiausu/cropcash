'use client';
/* The farm's parcels for /harta (docs/harta-plan.md, step 8). A farm on the server loads them from the API
   and keeps the answer on the phone, so the list and the cards still open without internet. Ion's farm
   and a farm only on the phone build theirs from the farm itself (lib/cc/farm-plots.ts). Work and outlines
   saved without internet wait in the queue and show here at once (step 11); when the queue sends them,
   the parcels are fetched again. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadPlotsParams, PENDING_PLOT_WRITES, withPendingPlotWrites, type FarmPlots } from '../../../packages/shared/src/plots/index';
import { ionPlots, isFarmPlots, PLOTS_COPY_KEY, readPlotsCopy, savePlotsCopy, unplacedFarmPlots } from '../../lib/cc/farm-plots';
import { loadPlots } from '../../lib/cc/plots';
import { useFarm, useOnline, useStore } from '../../lib/cc/react';
import { browserStore } from '../../lib/cc/storage';
import { storageKey } from '../../lib/paths';

export interface FarmPlotsState {
  plots: FarmPlots | null;
  /** Where they came from: the API just now, the copy on the phone, Ion's example, or the farm on the phone. */
  from: 'server' | 'copy' | 'ion' | 'phone' | null;
  /** When the copy on the phone came from the server, when that's what is shown. */
  copyAt: string | null;
  loading: boolean;
  /** The server didn't answer and there's no copy. */
  failed: boolean;
  reload: () => void;
}

const SEGMENTS = loadPlotsParams().curve_segments.value;
const isPlotWrite = (name: string) => (PENDING_PLOT_WRITES as readonly string[]).includes(name);

const safeStore = () => {
  try {
    return browserStore();
  } catch {
    return null;
  }
};

/**
 * `fetch: false` reads only the copy on the phone: the corner map asks the server only once it is opened,
 * so every page load doesn't cost a request.
 */
export function usePlots(year: number, { fetch = true }: { fetch?: boolean } = {}): FarmPlotsState {
  const farm = useFarm();
  const store = useStore();
  const online = useOnline();
  const onServer = !!farm?.me;
  const mode = farm?.mode ?? 'farm';
  const key = storageKey(PLOTS_COPY_KEY, mode);
  const [loaded, setLoaded] = useState<{ plots: FarmPlots; from: 'server' | 'copy'; at: string | null } | null>(() => {
    const kv = safeStore();
    const copy = kv ? readPlotsCopy(kv, key) : null;
    return copy ? { plots: copy.plots, from: 'copy', at: copy.at } : null;
  });
  const [loading, setLoading] = useState(onServer && fetch);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const outbox = farm?.outbox;
  const waiting = useMemo(() => (outbox ?? []).filter((i) => isPlotWrite(i.name)), [outbox]);
  /* One fewer waiting means one was sent: the server's copy has it now. */
  const sentSig = waiting.length;

  useEffect(() => {
    if (!onServer || !store || !fetch) return;
    if (!online) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    loadPlots(store.live)
      .then((plots) => {
        if (!live) return;
        if (!isFarmPlots(plots)) throw new Error('not a parcels answer');
        const at = new Date().toISOString();
        const kv = safeStore();
        if (kv) savePlotsCopy(kv, key, plots, at);
        setLoaded({ plots, from: 'server', at });
        setFailed(false);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [onServer, online, store, key, tick, fetch, sentSig]);

  const parcels = farm?.baseFarm?.parcels;
  const county = farm?.baseFarm?.county ?? '';
  const isIon = !!farm?.isIon;
  const own = useMemo(() => {
    if (onServer || !parcels) return null;
    return isIon ? ionPlots(parcels, year) : unplacedFarmPlots(parcels, county, year);
  }, [onServer, parcels, isIon, county, year]);

  const shown = useMemo(() => (loaded && waiting.length ? withPendingPlotWrites(loaded.plots, waiting, SEGMENTS) : (loaded?.plots ?? null)), [loaded, waiting]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  if (own) return { plots: own, from: isIon ? 'ion' : 'phone', copyAt: null, loading: false, failed: false, reload };
  return {
    plots: shown,
    from: loaded?.from ?? null,
    copyAt: loaded?.from === 'copy' ? loaded.at : null,
    loading: loading && !loaded,
    failed: failed && !loaded,
    reload,
  };
}
