'use client';
/* „Desenează parcela”: the farmer draws or corrects a parcel's outline on the map, with straight and
   curved edges and rounded corners (docs/harta-plan.md, step 5). Start from the APIA bloc (the usual
   case: shrink it to your part), from an empty map, or from pasted coordinates. Works offline on the
   tiles the phone already has; saving is the caller's (`onDone`). */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import {
  centroid,
  checkShape,
  loadPlotsParams,
  LPIS_SERVICE_URL,
  lpisOverlayTiles,
  maxCornerM,
  moveHandle,
  moveVertex,
  parseCoordinates,
  pointOnEdge,
  snapTo,
  MIN_VERTICES,
  type CoordinatesReading,
  type PlotGeometry,
  type Position,
  type Shape,
} from '../../../packages/shared/src/plots/index';
import { ha } from '../../lib/cc/format';
import { BASE_STYLE } from './style';
import { editorReducer, initialEditor, shownShape, type EditorState } from './editor-state';
import '../../styles/plots.css';

/** Romania, for a drawing with nothing to start from. */
const ROMANIA: Position = [25, 45.9];
const LINE = '#2F6B12';
const GUIDE: [number, number, number] = [60, 90, 40];
const LONG_PRESS_MS = 500;
/** An edge shorter than this on screen gets no + of its own: it would sit on its corners. Zoom in to reach it. */
const MIN_EDGE_PX = 64;

const PARAMS = loadPlotsParams();
const SEGMENTS = PARAMS.curve_segments.value;
const WARN_PCT = PARAMS.area_warning_pct.value;

export interface ShapeEditorResult {
  shape: Shape;
  geometry: PlotGeometry;
  areaAri: number;
}

export interface ShapeEditorProps {
  /** What the parcel is called, for the heading. */
  title: string;
  /** The APIA bloc it sits in: a starting point, a dashed guide and the 3 m snap. */
  bloc?: PlotGeometry | null;
  /** The drawing saved before, to edit again. */
  initial?: Shape | null;
  /** The area on the cerere, to compare the drawing with. */
  declaredAri: number | null;
  /** Where the map opens with no bloc or drawing to start from: where the farmer was looking. */
  start?: { centre: Position; zoom: number } | null;
  onDone: (result: ShapeEditorResult) => void;
  onCancel: () => void;
}

const PASTE_ERRORS: Record<Exclude<CoordinatesReading, { ok: true }>['error'], string> = {
  too_few: 'Ne trebuie cel puțin 3 puncte, câte unul pe rând.',
  unreadable: 'Nu înțelegem rândul {line}. Scrie două numere pe rând, de exemplu 44.1162, 24.9622.',
  outside_romania: 'Punctul de pe rândul {line} nu e în România. Dacă ai coordonate Stereo 70, încă nu le putem citi.',
};

const featureCollection = (features: object[]) => ({ type: 'FeatureCollection', features }) as never;
const lineFeature = (coords: Position[]) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: coords },
});

/** Dashed lines from each curve handle to the corners it pulls on. */
function guideLines(shape: Shape | null): object[] {
  if (!shape) return [];
  const n = shape.vertices.length;
  return shape.edges.flatMap((e, i) => {
    const a = shape.vertices[i]!.at;
    const b = shape.vertices[(i + 1) % n]!.at;
    if (e.type === 'quad') return [lineFeature([a, e.c, b])];
    if (e.type === 'cubic') return [lineFeature([a, e.c1]), lineFeature([e.c2, b])];
    return [];
  });
}

function startCentre(bloc: PlotGeometry | null | undefined, initial: Shape | null | undefined, start: ShapeEditorProps['start']): { centre: Position; zoom: number } {
  if (initial) return { centre: initial.vertices[0]!.at, zoom: 16 };
  if (bloc) return { centre: centroid(bloc), zoom: 16 };
  return start ?? { centre: ROMANIA, zoom: 6 };
}

export function ShapeEditor({ title, bloc = null, initial = null, declaredAri, start = null, onDone, onCancel }: ShapeEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initial, initialEditor);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  /** Bumped after each zoom, so the + markers are chosen again for the new scale. */
  const [zoomTick, setZoomTick] = useState(0);
  const [paste, setPaste] = useState<{
    text: string;
    error: string | null;
  } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  /** The latest state, for map event handlers set up once. */
  const latest = useRef<EditorState>(state);
  latest.current = state;

  const shape = shownShape(state);
  const committed = state.history.present;
  const check = useMemo(() => (shape ? checkShape(shape, SEGMENTS, declaredAri, WARN_PCT) : null), [shape, declaredAri]);
  const snap = (p: Position) => snapTo(p, bloc);

  // ── The map ──
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    let resize: ResizeObserver | null = null;
    const { centre, zoom } = startCentre(bloc, initial, start);
    void import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      created = new maplibregl.Map({
        container: container.current,
        style: BASE_STYLE,
        center: centre,
        zoom,
        attributionControl: { compact: true },
      });
      created.on('error', () => setTilesFailed(true));
      // The panel below can change height (tools come and go): keep the canvas the size of its box.
      const box = container.current;
      resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => created?.resize());
      resize?.observe(box);
      created.on('load', () => {
        const m = created!;
        m.addSource('lpis', {
          type: 'raster',
          tiles: [lpisOverlayTiles(LPIS_SERVICE_URL, GUIDE)],
          tileSize: 512,
          minzoom: 13,
        });
        m.addLayer({
          id: 'lpis',
          type: 'raster',
          source: 'lpis',
          paint: { 'raster-opacity': 0.8 },
        });
        m.addSource('bloc', {
          type: 'geojson',
          data: bloc ?? featureCollection([]),
        });
        m.addLayer({
          id: 'bloc',
          type: 'line',
          source: 'bloc',
          paint: {
            'line-color': LINE,
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
        m.addSource('shape', { type: 'geojson', data: featureCollection([]) });
        m.addLayer({
          id: 'shape-fill',
          type: 'fill',
          source: 'shape',
          paint: { 'fill-color': '#9ACD5C', 'fill-opacity': 0.35 },
        });
        m.addLayer({
          id: 'shape-line',
          type: 'line',
          source: 'shape',
          paint: { 'line-color': LINE, 'line-width': 3 },
        });
        m.addSource('guides', { type: 'geojson', data: featureCollection([]) });
        m.addLayer({
          id: 'guides',
          type: 'line',
          source: 'guides',
          paint: {
            'line-color': LINE,
            'line-width': 1,
            'line-dasharray': [1, 2],
          },
        });
        m.addSource('draft', { type: 'geojson', data: featureCollection([]) });
        m.addLayer({
          id: 'draft',
          type: 'line',
          source: 'draft',
          paint: {
            'line-color': LINE,
            'line-width': 2,
            'line-dasharray': [3, 2],
          },
        });
        m.on('zoomend', () => setZoomTick((t) => t + 1));
        setMap(m);
      });
      // Drawing from an empty map: each tap is a corner.
      created.on('click', (e) => {
        if (latest.current.draft)
          dispatch({
            type: 'add_point',
            at: snap([e.lngLat.lng, e.lngLat.lat]),
          });
        else dispatch({ type: 'select', selection: null });
      });
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      created?.remove();
    };
    // The map is made once; what it shows follows the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── What it shows ──
  useEffect(() => {
    if (!map) return;
    const set = (id: string, data: unknown) => (map.getSource(id) as { setData(d: unknown): void } | undefined)?.setData(data);
    set('shape', check ? featureCollection([{ type: 'Feature', properties: {}, geometry: check.geometry }]) : featureCollection([]));
    set('guides', featureCollection(guideLines(shape)));
    set('draft', featureCollection(state.draft && state.draft.length > 1 ? [lineFeature(state.draft)] : []));
  }, [map, shape, check, state.draft]);

  // ── Handles: corners, edge middles, curve handles. Rebuilt per step, not during a drag. ──
  useEffect(() => {
    if (!map || !committed) return;
    const markers: Marker[] = [];
    let alive = true;
    void import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!alive) return;
      const add = (el: HTMLElement, at: Position, draggable: boolean) => {
        const m = new maplibregl.Marker({ element: el, draggable }).setLngLat(at).addTo(map);
        markers.push(m);
        return m;
      };
      const button = (className: string, label: string, text = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        b.setAttribute('aria-label', label);
        b.textContent = text;
        return b;
      };
      committed.vertices.forEach((v, i) => {
        const selected = state.selected?.kind === 'vertex' && state.selected.i === i;
        const el = button(`se-v${selected ? ' on' : ''}${v.cornerM ? ' round' : ''}`, `Colțul ${i + 1}`);
        el.setAttribute('aria-pressed', String(selected));
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          dispatch({ type: 'select', selection: { kind: 'vertex', i } });
        });
        const m = add(el, v.at, true);
        const here = (): Position => snap([m.getLngLat().lng, m.getLngLat().lat]);
        m.on('drag', () => dispatch({ type: 'drag', shape: moveVertex(committed, i, here()) }));
        m.on('dragend', () => dispatch({ type: 'move_vertex', i, at: here() }));
      });

      const onScreen = (p: Position) => (typeof map.project === 'function' ? map.project(p) : null);
      const roomy = (i: number) => {
        const a = onScreen(committed.vertices[i]!.at);
        const b = onScreen(committed.vertices[(i + 1) % committed.vertices.length]!.at);
        return !a || !b || Math.hypot(a.x - b.x, a.y - b.y) >= MIN_EDGE_PX || (state.selected?.kind === 'edge' && state.selected.i === i);
      };

      committed.edges.forEach((e, i) => {
        const selected = state.selected?.kind === 'edge' && state.selected.i === i;
        const el = button(`se-mid${selected ? ' on' : ''}`, `Latura ${i + 1}: atinge ca să adaugi un colț, ține apăsat pentru curbă`, '+');
        let timer: ReturnType<typeof setTimeout> | undefined;
        let held = false;
        const pick = () => dispatch({ type: 'select', selection: { kind: 'edge', i } });
        el.addEventListener('pointerdown', () => {
          held = false;
          timer = setTimeout(() => {
            held = true;
            pick();
          }, LONG_PRESS_MS);
        });
        const stop = () => clearTimeout(timer);
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointerleave', stop);
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          held = true;
          pick();
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (held) return;
          dispatch({ type: 'insert', i });
        });
        if (roomy(i)) add(el, pointOnEdge(committed, i, 0.5), false);

        const handles: [0 | 1, Position][] =
          e.type === 'quad'
            ? [[0, e.c]]
            : e.type === 'cubic'
              ? [
                  [0, e.c1],
                  [1, e.c2],
                ]
              : [];
        for (const [which, pos] of handles) {
          const h = button('se-h', `Mânerul curbei de pe latura ${i + 1}`);
          h.addEventListener('click', (ev) => ev.stopPropagation());
          const m = add(h, pos, true);
          const here = (): Position => [m.getLngLat().lng, m.getLngLat().lat];
          m.on('drag', () =>
            dispatch({
              type: 'drag',
              shape: moveHandle(committed, i, which, here()),
            }),
          );
          m.on('dragend', () => dispatch({ type: 'move_handle', i, which, at: here() }));
        }
      });
    });
    return () => {
      alive = false;
      for (const m of markers) m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, committed, state.selected, zoomTick]);

  // ── Keyboard: arrows nudge the selected corner, Delete removes it, Ctrl+Z / Ctrl+Y ──
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      dispatch({ type: 'redo' });
      return;
    }
    if (state.selected?.kind !== 'vertex') return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      dispatch({
        type: 'nudge',
        eastM: moves[e.key]![0],
        northM: moves[e.key]![1],
      });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      dispatch({ type: 'delete_selected' });
    }
  }

  function usePasted() {
    const read = parseCoordinates(paste?.text ?? '');
    if (!read.ok) {
      setPaste(
        (p) =>
          p && {
            ...p,
            error: PASTE_ERRORS[read.error].replace('{line}', String(read.line ?? '')),
          },
      );
      return;
    }
    setPaste(null);
    dispatch({ type: 'start_points', points: read.points });
    map?.flyTo({ center: read.points[0]!, zoom: 16 });
  }

  const sel = state.selected;
  const selectedEdge = sel?.kind === 'edge' && committed ? committed.edges[sel.i] : null;
  const cornerMax = sel?.kind === 'vertex' && committed ? maxCornerM(committed, sel.i) : 0;
  const cornerNow = sel?.kind === 'vertex' && committed ? (committed.vertices[sel.i]?.cornerM ?? 0) : 0;
  const starting = !committed && !state.draft;

  return (
    <section className="shape-editor" aria-label={`Desenează ${title}`} onKeyDown={onKeyDown}>
      <div className="se-grid">
        <header className="se-head">
          <h2>Desenează {title}</h2>
          <button type="button" className="btn btn-line" onClick={onCancel}>
            Renunță
          </button>
        </header>

        <div className="se-map" ref={container} data-testid="se-map" />
        {tilesFailed && <p className="se-note">Harta are nevoie de internet. Poți desena și așa, pe fundal gol, și salvezi când ai net.</p>}

        <div className="se-panel">
          {starting && !paste && (
            <div className="se-start">
              <p className="hint">Cum vrei să începi?</p>
              {bloc && (
                <button type="button" className="btn btn-dark" onClick={() => dispatch({ type: 'start_from', geometry: bloc })}>
                  Pornește de la bloc
                </button>
              )}
              <button type="button" className={bloc ? 'btn btn-line' : 'btn btn-dark'} onClick={() => dispatch({ type: 'start_empty' })}>
                Desenez de la zero
              </button>
              <button type="button" className="btn btn-line" onClick={() => setPaste({ text: '', error: null })}>
                Lipesc coordonate
              </button>
            </div>
          )}

          {paste && (
            <div className="se-paste">
              <label>
                Coordonatele colțurilor, câte una pe rând
                <textarea rows={5} value={paste.text} placeholder={'44.1162, 24.9622\n44.1162, 24.9632\n44.1172, 24.9632'} onChange={(e) => setPaste({ text: e.target.value, error: null })} />
              </label>
              {paste.error && (
                <p className="ob-err" role="alert">
                  {paste.error}
                </p>
              )}
              <div className="se-row">
                <button type="button" className="btn btn-dark" onClick={usePasted}>
                  Folosește punctele
                </button>
                <button type="button" className="btn btn-line" onClick={() => setPaste(null)}>
                  Înapoi
                </button>
              </div>
            </div>
          )}

          {state.draft && (
            <div className="se-adding">
              <p className="hint" aria-live="polite">
                Atinge harta în fiecare colț al parcelei, pe rând. {state.draft.length === 0 ? '' : state.draft.length === 1 ? 'Ai pus un colț.' : `Ai pus ${state.draft.length} colțuri.`}
              </p>
              <div className="se-row">
                <button type="button" className="btn btn-dark" disabled={state.draft.length < MIN_VERTICES} onClick={() => dispatch({ type: 'close_draft' })}>
                  Închide forma
                </button>
                <button type="button" className="btn btn-line" disabled={state.draft.length === 0} onClick={() => dispatch({ type: 'undo' })}>
                  Șterge ultimul colț
                </button>
              </div>
            </div>
          )}

          {committed && check && (
            <>
              <p className="se-area" aria-live="polite">
                Desenat: <b>{ha(check.areaAri)} ha</b>
                {declaredAri ? (
                  <>
                    {' '}
                    · Pe cerere: <b>{ha(declaredAri)} ha</b>
                  </>
                ) : null}
              </p>
              {check.areaWarning && (
                <p className="pr-warn" role="status">
                  Desenul diferă cu mai mult de {WARN_PCT}% de suprafața de pe cerere. Verifică marginile.
                </p>
              )}
              {!check.simple && (
                <p className="ob-err" role="alert">
                  Marginile se intersectează. Mută colțurile ca să nu se mai taie.
                </p>
              )}

              {sel?.kind === 'vertex' && (
                <div className="se-tools" role="group" aria-label={`Colțul ${sel.i + 1}`}>
                  <label className="se-slider">
                    Rotunjește colțul: {cornerNow ? `${cornerNow} m` : 'ascuțit'}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(cornerMax, 0)}
                      step={1}
                      value={Math.min(cornerNow, cornerMax)}
                      disabled={cornerMax === 0}
                      onChange={(e) =>
                        dispatch({
                          type: 'corner',
                          i: sel.i,
                          metres: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <button type="button" className="btn btn-line" disabled={committed.vertices.length <= MIN_VERTICES} onClick={() => dispatch({ type: 'delete_selected' })}>
                    Șterge colțul
                  </button>
                </div>
              )}
              {sel?.kind === 'edge' && selectedEdge && (
                <div className="se-tools" role="group" aria-label={`Latura ${sel.i + 1}`}>
                  {selectedEdge.type === 'line' ? (
                    <button type="button" className="btn btn-line" onClick={() => dispatch({ type: 'curve', i: sel.i })}>
                      Fă-o curbă
                    </button>
                  ) : (
                    <button type="button" className="btn btn-line" onClick={() => dispatch({ type: 'straight', i: sel.i })}>
                      Fă-o dreaptă
                    </button>
                  )}
                  <button type="button" className="btn btn-line" onClick={() => dispatch({ type: 'insert', i: sel.i })}>
                    Adaugă un colț aici
                  </button>
                </div>
              )}
              {!sel && <p className="hint">Trage de colțuri. Atinge + ca să adaugi un colț; ține apăsat pe + ca să faci latura curbă.</p>}

              <div className="se-row">
                <button type="button" className="btn btn-line" disabled={!state.history.past.length} onClick={() => dispatch({ type: 'undo' })}>
                  Înapoi un pas
                </button>
                <button type="button" className="btn btn-line" disabled={!state.history.future.length} onClick={() => dispatch({ type: 'redo' })}>
                  Refă
                </button>
                <button type="button" className="btn btn-line" onClick={() => dispatch({ type: 'restart' })}>
                  Ia-o de la capăt
                </button>
              </div>
              <button
                type="button"
                className="btn btn-dark se-done"
                disabled={!check.simple || !!state.preview}
                onClick={() =>
                  onDone({
                    shape: committed,
                    geometry: check.geometry,
                    areaAri: check.areaAri,
                  })
                }
              >
                Gata
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
