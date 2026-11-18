'use client';
/* The parcel filters and view, kept in the address (/harta?cultura=grau&recolta=2027-07..2027-08), so a
   filtered view can be shared, bookmarked or opened by the assistant (docs/harta-plan.md, step 6).
   Changes replace the address instead of adding history steps: Back leaves the page, it doesn't undo a
   filter. Other keys in the address are kept. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_VIEW, filtersFromQuery, filtersToQuery, PLOT_QUERY_KEYS, viewFromQuery, viewToQuery, type PlotFilters, type PlotView } from '../../../packages/shared/src/plots/index';

export interface PlotQuery {
  filters: PlotFilters;
  view: PlotView;
  setFilters: (f: PlotFilters) => void;
  setView: (v: PlotView) => void;
  /** False until the address has been read: the static page renders before it knows. */
  ready: boolean;
}

/** The address with the parcel keys replaced, or null when it wouldn't change. */
export function addressWith(href: string, filters: PlotFilters, view: PlotView): string | null {
  const [base, rest = ''] = href.split('#')[0]!.split('?');
  const params = new URLSearchParams(rest);
  for (const k of PLOT_QUERY_KEYS) params.delete(k);
  for (const [k, v] of Object.entries({ ...filtersToQuery(filters), ...viewToQuery(view) })) params.set(k, v);
  const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
  // Commas and dots read better in a shared link than %2C.
  const query = params.toString().replace(/%2C/g, ',');
  const next = `${base}${query ? `?${query}` : ''}${hash}`;
  return next === href ? null : next;
}

export function usePlotQuery(): PlotQuery {
  const [state, setState] = useState<{ filters: PlotFilters; view: PlotView; ready: boolean }>({ filters: {}, view: DEFAULT_VIEW, ready: false });
  const wanted = useRef(state);
  wanted.current = state;

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setState({ filters: filtersFromQuery(q), view: viewFromQuery(q), ready: true });
  }, []);

  /* A sheet open on top owns this history entry and steps back when it closes (useSheetHistory), which
     would drop an address written now. So write only on the page's own entry, and again after a Back. */
  const write = useCallback(() => {
    const s = wanted.current;
    if (!s.ready || history.state?.ccSheet) return;
    const next = addressWith(location.href, s.filters, s.view);
    if (next) history.replaceState(history.state, '', next);
  }, []);

  useEffect(write, [state, write]);
  useEffect(() => {
    addEventListener('popstate', write);
    return () => removeEventListener('popstate', write);
  }, [write]);

  return {
    ...state,
    setFilters: useCallback((filters: PlotFilters) => setState((s) => ({ ...s, filters })), []),
    setView: useCallback((view: PlotView) => setState((s) => ({ ...s, view })), []),
  };
}
