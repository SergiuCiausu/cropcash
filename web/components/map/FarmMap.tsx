'use client';
/* The farm map (docs/harta-plan.md, step 7): the farmer's parcels on a cartoon map, coloured by crop, by
   result per hectare or by the next piece of work. Opens with a short flight from the globe to the farm,
   once per session. Parcels the filters leave out are dimmed, not hidden. Motion stops under
   prefers-reduced-motion and while the tab is hidden. Load it with FarmMapLazy (no server render).

   Offline: the parcels are local data and always show; the base map, the satellite and the APIA blocs
   need the internet, and the map says so when it can't load them. */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Crop } from '../../../packages/shared/src/data/index';
import { LPIS_SERVICE_URL, lpisOverlayTiles, type PlotRow, type Position } from '../../../packages/shared/src/plots/index';
import { storageKey } from '../../lib/paths';
import { FrameContext } from '../app/context';
import { NetButton } from '../app/bits';
import { boxOf, legendOf, plotFeatures, type ColorBy, type PlotFeatures } from './features';
import { INK } from './palette';
import { iconId, iconImage, patternImage, PIXEL_RATIO } from './patterns';
import { BASE_STYLE, cartoonStyle, firstLabelLayer, SATELLITE_ATTRIBUTION, satelliteTiles, type StyleJson } from './style';
import '../../styles/map.css';

export interface FarmMapHandle {
  /** Flies to one parcel. */
  flyToPlot: (id: string) => void;
  /** Fits these parcels in view; all of them when empty. */
  fitPlots: (ids?: readonly string[]) => void;
}

export interface FarmMapProps {
  rows: readonly PlotRow[];
  /** The farm's crops, for colours and icons by genus. */
  crops: readonly Pick<Crop, 'id' | 'genus' | 'kind'>[];
  selectedIds?: readonly string[];
  /** Left out by the filters: drawn faint. */
  dimmedIds?: readonly string[];
  /** The colouring it opens with; the farmer can change it in „full” mode. */
  colorBy?: ColorBy;
  onSelect?: (id: string | null) => void;
  /** „mini”: the corner map, flat, without controls or motion. */
  mode?: 'full' | 'mini';
  /** The globe-to-farm flight on opening (once per session). */
  intro?: boolean;
  names: { cropName: (id: string) => string; plotTitle: (row: PlotRow) => string };
  today: string;
  /** plots-params.json todo_soon_days. */
  soonDays: number;
  /** MapTiler key (publicConfig().maptilerKey); without it there is no „Satelit”. */
  satelliteKey?: string | null;
  /** Room covered by other things (the side list), so flights centre in what can be seen. */
  padding?: { top: number; right: number; bottom: number; left: number };
  className?: string;
  ref?: Ref<FarmMapHandle>;
}

const ROMANIA: Position = [25, 45.9];
const GLOBE_START: Position = [22, 32];
const FLY_MS = 1600;
const PITCH = 55;
/** Above this many parcels, icons are drawn by the map instead of one HTML marker each. */
export const MARKER_LIMIT = 50;
const INTRO_KEY = 'cropcash-map-intro-seen';
const PLOT_LAYERS = ['cc-plots-3d', 'cc-plots-3d-dim', 'cc-plots-flat', 'cc-points'];

let baseStyle: Promise<StyleJson | null> | null = null;
/** The base style JSON, fetched once per page; null without internet. */
function loadBaseStyle(): Promise<StyleJson | null> {
  baseStyle ??= fetch(BASE_STYLE, { signal: AbortSignal.timeout?.(8000) })
    .then((r) => (r.ok ? (r.json() as Promise<StyleJson>) : null))
    .catch(() => null)
    .then((s) => {
      if (!s) baseStyle = null; // try again next time
      return s;
    });
  return baseStyle;
}

/** Tests start each map from the network again. */
export const forgetBaseStyle = () => {
  baseStyle = null;
};

function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = typeof matchMedia === 'function' ? matchMedia(query) : null;
    if (!m) return;
    setOn(m.matches);
    const change = () => setOn(m.matches);
    m.addEventListener?.('change', change);
    return () => m.removeEventListener?.('change', change);
  }, [query]);
  return on;
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return hidden;
}

const sessionGet = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const sessionSet = (k: string) => {
  try {
    sessionStorage.setItem(k, '1');
  } catch {
    /* private mode: the intro may play again, nothing more */
  }
};

/** The parcel layers, under the base map's labels. */
function addPlotLayers(m: MapLibreMap, before: string | undefined, full: boolean) {
  const empty = { type: 'FeatureCollection', features: [] } as never;
  m.addSource('cc-plots', { type: 'geojson', data: empty });
  m.addSource('cc-points', { type: 'geojson', data: empty });
  m.addSource('cc-icons', { type: 'geojson', data: empty });
  const sure = ['==', ['get', 'approx'], 0];
  const rough = ['==', ['get', 'approx'], 1];
  const dim = ['==', ['get', 'dim'], 1];
  const add = (layer: Record<string, unknown>) => m.addLayer(layer as never, before);
  // Rough places: flat, hatched by colour only, dashed edge.
  add({ id: 'cc-plots-flat', type: 'fill', source: 'cc-plots', filter: rough, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', dim, 0.12, 0.3] } });
  add({
    id: 'cc-plots-approx-line',
    type: 'line',
    source: 'cc-plots',
    filter: rough,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': INK.approx, 'line-width': full ? 2.5 : 1.5, 'line-dasharray': [2, 1.5], 'line-opacity': ['case', dim, 0.3, 0.85] },
  });
  // Known outlines: low blocks, the selected one a little higher.
  const height = full ? ['case', ['==', ['get', 'selected'], 1], 6, 3] : 0;
  add({ id: 'cc-plots-3d', type: 'fill-extrusion', source: 'cc-plots', filter: ['all', sure, ['==', ['get', 'dim'], 0]], paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': height, 'fill-extrusion-opacity': 0.95 } });
  add({ id: 'cc-plots-3d-dim', type: 'fill-extrusion', source: 'cc-plots', filter: ['all', sure, dim], paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': full ? 1 : 0, 'fill-extrusion-opacity': 0.3 } });
  add({
    id: 'cc-plots-outline',
    type: 'line',
    source: 'cc-plots',
    filter: sure,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': INK.outline, 'line-width': full ? 3 : 1.5, 'line-opacity': ['case', dim, 0.25, 0.85] },
  });
  add({
    id: 'cc-plots-selected',
    type: 'line',
    source: 'cc-plots',
    filter: ['==', ['get', 'selected'], 1],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': INK.selected, 'line-width': full ? 5 : 3 },
  });
  // Placed only somewhere in the commune: a soft circle at its middle.
  add({
    id: 'cc-points',
    type: 'circle',
    source: 'cc-points',
    paint: {
      'circle-radius': full ? 22 : 10,
      'circle-color': ['get', 'color'],
      'circle-opacity': ['case', dim, 0.15, 0.4],
      'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], INK.selected, INK.approx],
      'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 4, 2],
      'circle-stroke-opacity': ['case', dim, 0.3, 0.9],
    },
  });
  // Many parcels: the icons as one symbol layer.
  add({
    id: 'cc-icons',
    type: 'symbol',
    source: 'cc-icons',
    layout: { 'icon-image': ['get', 'image'], 'icon-size': 0.9, 'icon-allow-overlap': false, visibility: 'none' },
    paint: { 'icon-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1] },
  });
}

/** Adds pattern and icon images not made yet; false when there's no canvas to make them. */
function ensureImages(m: MapLibreMap, f: PlotFeatures, icons: boolean): boolean {
  let ok = true;
  for (const p of f.patterns) {
    if (m.hasImage(p.id)) continue;
    const img = patternImage(p.pattern, p.color);
    if (!img) ok = false;
    else m.addImage(p.id, img, { pixelRatio: PIXEL_RATIO });
  }
  if (icons)
    for (const emoji of new Set(f.icons.map((i) => i.icon))) {
      const id = iconId(emoji);
      if (m.hasImage(id)) continue;
      const img = iconImage(emoji);
      if (img) m.addImage(id, img, { pixelRatio: PIXEL_RATIO });
    }
  return ok;
}

export function FarmMap(props: FarmMapProps) {
  const { rows, crops, selectedIds = [], dimmedIds = [], onSelect, mode = 'full', intro = false, names, today, soonDays, satelliteKey, padding, className, ref } = props;
  const full = mode === 'full';
  const frame = useContext(FrameContext);
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [lib, setLib] = useState<typeof import('maplibre-gl') | null>(null);
  const [offline, setOffline] = useState(false);
  const [colorBy, setColorBy] = useState<ColorBy>(props.colorBy ?? 'crop');
  const [satellite, setSatellite] = useState(false);
  const [blocs, setBlocs] = useState(false);
  const [legendOpen, setLegendOpen] = useState(full);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const hidden = usePageHidden();

  const cropMap = useMemo(() => new Map(crops.map((c) => [c.id, c])), [crops]);
  const selectedKey = selectedIds.join('|');
  const dimmedKey = dimmedIds.join('|');
  const options = useMemo(
    () => ({ crops: cropMap, colorBy, selected: new Set(selectedIds), dimmed: new Set(dimmedIds), today, soonDays }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cropMap, colorBy, selectedKey, dimmedKey, today, soonDays],
  );
  const feats = useMemo(() => plotFeatures(rows, options), [rows, options]);
  const legend = useMemo(() => legendOf(rows, options, names.cropName), [rows, options, names.cropName]);
  const placedCount = feats.boxes.size;

  /** The latest of what map event handlers and the handle need. */
  const latest = useRef({ feats, onSelect, padding, reduced, full, selectedIds });
  latest.current = { feats, onSelect, padding, reduced, full, selectedIds };

  function fit(m: MapLibreMap, ids: readonly string[] = [], duration?: number) {
    const l = latest.current;
    const b = boxOf(l.feats.boxes, ids);
    const ms = l.reduced ? 0 : (duration ?? FLY_MS);
    if (!b) return;
    const pad = l.full ? (l.padding ?? { top: 80, right: 80, bottom: 80, left: 80 }) : 16;
    if (b.west === b.east && b.south === b.north) {
      m.flyTo({ center: [b.west, b.south], zoom: 12, pitch: l.full ? PITCH : 0, duration: ms, essential: true });
      return;
    }
    m.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: pad, pitch: l.full ? PITCH : 0, duration: ms, maxZoom: 15.5, essential: true },
    );
  }

  useImperativeHandle(
    ref,
    () => ({
      flyToPlot: (id) => map && fit(map, [id]),
      fitPlots: (ids = []) => map && fit(map, ids),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map],
  );

  // ── The map, made once ──
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    let resize: ResizeObserver | null = null;
    void Promise.all([import('maplibre-gl'), loadBaseStyle()]).then(([{ default: maplibregl }, base]) => {
      if (cancelled || !box.current) return;
      if (!base) setOffline(true);
      const style = cartoonStyle(base, { globe: full, hillshade: full && !!base });
      const seenKey = storageKey(INTRO_KEY, frame.mode);
      const reducedNow = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const flight = full && intro && !reducedNow && !sessionGet(seenKey) && latest.current.feats.boxes.size > 0;
      created = new maplibregl.Map({
        container: box.current,
        style: style as never,
        center: flight ? GLOBE_START : ROMANIA,
        zoom: flight ? 1.2 : 6,
        attributionControl: { compact: true },
        interactive: full,
        maxPitch: 70,
      });
      const m = created;
      resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => m.resize());
      resize?.observe(box.current);
      m.on('error', () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) setOffline(true);
      });
      m.on('load', () => {
        addPlotLayers(m, firstLabelLayer(style), full);
        setLib(() => maplibregl);
        setMap(m);
        if (flight) {
          sessionSet(seenKey);
          m.flyTo({ center: ROMANIA, zoom: 5.6, duration: 1100, essential: true });
          // It lands on the parcels already picked (a card opened from the address), or on all of them.
          m.once('moveend', () => fit(m, latest.current.selectedIds, 1400));
        } else {
          fit(m, latest.current.selectedIds, 0);
        }
      });
      m.on('click', (e) => {
        const hit = m.queryRenderedFeatures(e.point, { layers: PLOT_LAYERS.filter((id) => m.getLayer(id)) })[0];
        const id = (hit?.properties as { id?: string } | undefined)?.id ?? null;
        latest.current.onSelect?.(id);
      });
      for (const id of PLOT_LAYERS) {
        m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
      }
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      created?.remove();
    };
    // The map is made once; what it shows follows the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── What it shows ──
  const many = feats.icons.length > MARKER_LIMIT || !full;
  useEffect(() => {
    if (!map) return;
    const patterned = ensureImages(map, feats, full && many);
    (map.getSource('cc-plots') as GeoJSONSource | undefined)?.setData(feats.areas as never);
    (map.getSource('cc-points') as GeoJSONSource | undefined)?.setData(feats.points as never);
    const iconFeatures = full && many ? feats.icons.map((i) => ({ type: 'Feature', properties: { id: i.id, image: iconId(i.icon), dim: i.dim ? 1 : 0 }, geometry: { type: 'Point', coordinates: i.at } })) : [];
    (map.getSource('cc-icons') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: iconFeatures } as never);
    map.setLayoutProperty?.('cc-icons', 'visibility', iconFeatures.length ? 'visible' : 'none');
    if (patterned) for (const id of ['cc-plots-3d', 'cc-plots-3d-dim']) map.setPaintProperty?.(id, 'fill-extrusion-pattern', ['get', 'patternId']);
  }, [map, feats, full, many]);

  // ── One HTML marker per crop icon, bobbing, when there are few ──
  useEffect(() => {
    if (!map || !lib || !full || many) return;
    const markers: Marker[] = [];
    const titleOf = new Map(rows.map((r) => [r.plot.id, names.plotTitle(r)]));
    feats.icons.forEach((icon, n) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `fm-icon${icon.dim ? ' dim' : ''}${options.selected.has(icon.id) ? ' on' : ''}`;
      el.style.setProperty('--bob-delay', `${(n % 7) * -0.37}s`);
      el.textContent = icon.icon;
      el.setAttribute('aria-label', titleOf.get(icon.id) ?? 'Parcelă');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        latest.current.onSelect?.(icon.id);
      });
      markers.push(new lib.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(icon.at).addTo(map));
    });
    return () => {
      for (const m of markers) m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, lib, feats, many, full]);

  // ── The selected parcel breathes ──
  useEffect(() => {
    if (!map || !full || reduced || hidden || !selectedIds.length) {
      map?.setPaintProperty?.('cc-plots-selected', 'line-width', full ? 5 : 3);
      return;
    }
    let frameId = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 33) {
        last = t;
        map.setPaintProperty('cc-plots-selected', 'line-width', 5 + 2 * Math.sin(t / 380));
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, full, reduced, hidden, selectedKey]);

  // ── Satellite and APIA blocs, added the first time they're asked for ──
  useEffect(() => {
    if (!map) return;
    const before = 'cc-plots-flat';
    if (satellite && satelliteKey && !map.getSource('cc-sat')) {
      map.addSource('cc-sat', { type: 'raster', tiles: [satelliteTiles(satelliteKey)], tileSize: 512, maxzoom: 20, attribution: SATELLITE_ATTRIBUTION });
      map.addLayer({ id: 'cc-sat', type: 'raster', source: 'cc-sat' }, before);
    }
    if (blocs && !map.getSource('cc-lpis')) {
      map.addSource('cc-lpis', { type: 'raster', tiles: [lpisOverlayTiles(LPIS_SERVICE_URL, [60, 90, 40])], tileSize: 512, minzoom: 13 });
      map.addLayer({ id: 'cc-lpis', type: 'raster', source: 'cc-lpis', paint: { 'raster-opacity': 0.8 } }, before);
    }
    if (map.getLayer('cc-sat')) map.setLayoutProperty('cc-sat', 'visibility', satellite ? 'visible' : 'none');
    if (map.getLayer('cc-lpis')) map.setLayoutProperty('cc-lpis', 'visibility', blocs ? 'visible' : 'none');
  }, [map, satellite, blocs, satelliteKey]);

  const animate = full && !reduced && !hidden;
  return (
    <div className={`farm-map ${full ? 'full' : 'mini'}${animate ? '' : ' still'}${className ? ` ${className}` : ''}`}>
      <div className="fm-canvas" ref={box} data-testid="farm-map" />
      {full && <div className="fm-clouds" aria-hidden="true" />}

      {full && (
        <div className="fm-tools" role="group" aria-label="Harta">
          <label className="fm-select">
            <span>Culoare după</span>
            <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
              <option value="crop">Cultură</option>
              <option value="result">Rezultat pe hectar</option>
              <option value="nextTreatment">Lucrări de făcut</option>
            </select>
          </label>
          {satelliteKey && (
            <NetButton className="fm-toggle" reason="Satelitul are nevoie de internet." aria-pressed={satellite} onClick={() => setSatellite((s) => !s)}>
              Satelit
            </NetButton>
          )}
          <NetButton className="fm-toggle" reason="Blocurile APIA au nevoie de internet." aria-pressed={blocs} onClick={() => setBlocs((s) => !s)}>
            Blocuri APIA
          </NetButton>
        </div>
      )}

      {full && legend.length > 0 && (
        <div className="fm-legend">
          <button type="button" className="fm-legend-head" aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)}>
            Legendă
          </button>
          {legendOpen && (
            <ul>
              {legend.map((l) => (
                <li key={l.label}>
                  <span className="fm-swatch" style={{ background: l.color }} aria-hidden="true">
                    {l.icon}
                  </span>
                  {l.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {offline && <p className="fm-note">Harta are nevoie de internet. Parcelele tale se văd și așa, pe fundal gol.</p>}
      {full && map && placedCount === 0 && <p className="fm-note">Nicio parcelă nu e încă pe hartă. Adaugă cererea APIA sau desenează una.</p>}
    </div>
  );
}
