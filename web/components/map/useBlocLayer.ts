/* „Blocuri APIA” as outlines the farmer can tap (docs/harta-plan.md). From zoom LPIS_MIN_ZOOM the map asks
   the API for the squares of the bloc grid it shows (lpis-tiles.ts), a few at a time, middle first, and
   keeps each answer for the page's life. The API answers from the local copy (lpis_blocs) or from APIA.
   A square that fails is asked again on the next move; while any fails, FarmMap shows APIA's own picture
   of the blocs instead, so the farmer still sees them.
   Offline: nothing is asked; squares already loaded stay on the map. */
import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { lpisTileKey, lpisTilesFor, type LpisBloc, type LpisTile } from '../../../packages/shared/src/plots/index';

/** Squares asked at once: APIA is slow, and one page shouldn't flood it. */
const AT_ONCE = 4;
export const BLOC_LAYERS = { fill: 'cc-blocs-fill', line: 'cc-blocs-line', picked: 'cc-blocs-picked', label: 'cc-blocs-label' } as const;
const SOURCE = 'cc-blocs';
const LINE = '#3C5A28';

export interface BlocLayer {
  /** A bloc by its fbid, among those loaded. */
  find: (fbid: string) => LpisBloc | undefined;
  /** Some square couldn't be loaded the last time it was asked. */
  failed: boolean;
}

/** Adds the outline layers under the parcels, the first time blocs are shown. */
function ensureLayers(m: MapLibreMap, before: string) {
  if (m.getSource(SOURCE)) return;
  m.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as never });
  const add = (layer: Record<string, unknown>) => m.addLayer(layer as never, m.getLayer(before) ? before : undefined);
  // Almost clear, so a tap anywhere on a bloc finds it.
  add({ id: BLOC_LAYERS.fill, type: 'fill', source: SOURCE, paint: { 'fill-color': LINE, 'fill-opacity': 0.04 } });
  add({ id: BLOC_LAYERS.line, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': LINE, 'line-width': 1.5, 'line-opacity': 0.85 } });
  add({ id: BLOC_LAYERS.picked, type: 'line', source: SOURCE, filter: ['==', ['get', 'fbid'], ''], layout: { 'line-join': 'round' }, paint: { 'line-color': '#7C5CFC', 'line-width': 4 } });
  // Bloc numbers close up, only when the style has fonts (not on the plain offline background).
  if (typeof m.getStyle === 'function' && m.getStyle()?.glyphs)
    add({
      id: BLOC_LAYERS.label,
      type: 'symbol',
      source: SOURCE,
      minzoom: 15,
      layout: { 'text-field': ['get', 'bloc'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'point' },
      paint: { 'text-color': LINE, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 },
    });
}

function setVisible(m: MapLibreMap, visible: boolean) {
  for (const id of Object.values(BLOC_LAYERS)) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

export function useBlocLayer(opts: {
  map: MapLibreMap | null;
  on: boolean;
  minZoom: number;
  load: ((t: LpisTile) => Promise<LpisBloc[]>) | undefined;
  /** The parcels' lowest layer: the blocs go under it. */
  before: string;
  picked: string | null;
}): BlocLayer {
  const { map, on, minZoom, load, before, picked } = opts;
  const tiles = useRef(new Map<string, LpisBloc[]>());
  const asking = useRef(new Set<string>());
  const byFbid = useRef(new Map<string, LpisBloc>());
  const [failed, setFailed] = useState(false);
  const latest = useRef({ load, minZoom });
  latest.current = { load, minZoom };

  useEffect(() => {
    if (!map || !load) return;
    if (!on) {
      setVisible(map, false);
      return;
    }
    ensureLayers(map, before);
    setVisible(map, true);
    let stopped = false;

    const draw = () => {
      const features = [...byFbid.current.values()].map((b) => ({ type: 'Feature', properties: { fbid: b.fbid, bloc: b.bloc }, geometry: b.geometry }));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as never);
    };

    const fetchShown = () => {
      const { load: ask, minZoom: min } = latest.current;
      if (stopped || !ask || map.getZoom() < min) return;
      const b = map.getBounds();
      const wanted = lpisTilesFor({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }).filter((t) => {
        const k = lpisTileKey(t);
        return !tiles.current.has(k) && !asking.current.has(k);
      });
      if (!wanted.length) return;
      let next = 0;
      let anyFailed = false;
      const worker = async () => {
        while (!stopped && next < wanted.length) {
          const t = wanted[next++]!;
          const k = lpisTileKey(t);
          asking.current.add(k);
          try {
            const blocs = await ask(t);
            tiles.current.set(k, blocs);
            for (const bloc of blocs) byFbid.current.set(bloc.fbid, bloc);
            if (!stopped) draw();
          } catch {
            anyFailed = true;
          } finally {
            asking.current.delete(k);
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(AT_ONCE, wanted.length) }, worker)).then(() => {
        if (!stopped) setFailed(anyFailed);
      });
    };

    draw();
    fetchShown();
    map.on('moveend', fetchShown);
    return () => {
      stopped = true;
      map.off?.('moveend', fetchShown);
    };
  }, [map, on, load, before]);

  useEffect(() => {
    if (map?.getLayer(BLOC_LAYERS.picked)) map.setFilter?.(BLOC_LAYERS.picked, ['==', ['get', 'fbid'], picked ?? '']);
  }, [map, picked, on]);

  return { find: (fbid) => byFbid.current.get(fbid), failed };
}
