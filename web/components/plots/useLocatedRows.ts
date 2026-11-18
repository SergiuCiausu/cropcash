'use client';
/* Looks up where each row of a paper is on the map while the review sheet is open (docs/harta-plan.md,
   step 4), and keeps the answers by row. Empty for Ion's farm, which has no API. */
import { useEffect, useState } from 'react';
import { loadPlotsParams, type PaperPlot } from '../../../packages/shared/src/plots/index';
import { locatePaperPlots, type RowLocation } from '../../lib/cc/lpis';
import { useOnline, useStore } from '../../lib/cc/react';

export function useLocatedRows(plots: readonly PaperPlot[] | null): Record<number, RowLocation> {
  const live = useStore()?.live ?? null;
  const online = useOnline();
  const [located, setLocated] = useState<Record<number, RowLocation>>({});
  useEffect(() => {
    if (!plots?.length || !live) return;
    let cancelled = false;
    setLocated({});
    void locatePaperPlots(live, plots, {
      warnPct: loadPlotsParams().area_warning_pct.value,
      isOnline: () => navigator.onLine !== false,
      isCancelled: () => cancelled,
      onRow: (row, location) => setLocated((x) => ({ ...x, [row]: location })),
    });
    return () => {
      cancelled = true;
    };
    // Looked up again when the internet comes back.
  }, [plots, live, online]);
  return located;
}
