// @vitest-environment happy-dom
/* The farm map (docs/harta-plan.md, step 7), with MapLibre replaced by a fake that keeps what the map is
   given: style, sources, layers, camera moves and markers. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { op, plot, season } from '../../../packages/shared/src/plots/fixtures';
import { buildPlotRows, parseBlocs, type PlotRow } from '../../../packages/shared/src/plots/index';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import { FarmMap, forgetBaseStyle, LPIS_MIN_ZOOM, MARKER_LIMIT, type FarmMapHandle, type FarmMapProps } from './FarmMap';

type Call = [string, ...unknown[]];
interface FakeMap {
  opts: { zoom: number; interactive: boolean; style: { layers: { id: string }[]; projection?: unknown } };
  calls: Call[];
  sources: Record<string, { data?: { features: { properties: Record<string, unknown> }[] } }>;
  layers: Record<string, { layout: Record<string, unknown>; paint: Record<string, unknown> }>;
  fire(ev: string, e?: unknown): void;
  hit: unknown[];
  hitBy: Record<string, unknown[]>;
}
const fake = vi.hoisted(() => ({ maps: [] as FakeMap[], markers: [] as { el: HTMLElement }[] }));

vi.mock('maplibre-gl', () => {
  class Map {
    calls: Call[] = [];
    handlers: Record<string, ((e?: unknown) => void)[]> = {};
    sources: Record<string, { data?: unknown; setData: (d: unknown) => void }> = {};
    layers: Record<string, { layout: Record<string, unknown>; paint: Record<string, unknown> }> = {};
    images = new Set<string>();
    hit: unknown[] = [];
    constructor(public opts: { container: HTMLElement }) {
      fake.maps.push(this as never);
    }
    on(ev: string, a: unknown, b?: unknown) {
      const cb = (typeof a === 'function' ? a : b) as (e?: unknown) => void;
      const key = typeof a === 'string' ? `${ev}:${a}` : ev;
      (this.handlers[key] ??= []).push(cb);
      if (ev === 'load') queueMicrotask(() => cb());
      return this;
    }
    once(ev: string, cb: () => void) {
      return this.on(ev, cb);
    }
    fire(ev: string, e?: unknown) {
      for (const cb of this.handlers[ev] ?? []) cb(e);
    }
    addSource(id: string, s: { data?: unknown }) {
      const src = { ...s, setData: (d: unknown) => (src.data = d) };
      this.sources[id] = src;
    }
    getSource(id: string) {
      return this.sources[id];
    }
    addLayer(l: { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }) {
      this.layers[l.id] = { layout: { ...l.layout }, paint: { ...l.paint } };
    }
    getLayer(id: string) {
      return this.layers[id];
    }
    setLayoutProperty(id: string, k: string, v: unknown) {
      this.layers[id]!.layout[k] = v;
    }
    setPaintProperty(id: string, k: string, v: unknown) {
      this.layers[id]!.paint[k] = v;
    }
    hasImage(id: string) {
      return this.images.has(id);
    }
    addImage(id: string) {
      this.images.add(id);
    }
    setTerrain(t: unknown) {
      this.calls.push(['setTerrain', t]);
    }
    flyTo(o: unknown) {
      this.calls.push(['flyTo', o]);
    }
    fitBounds(b: unknown, o: unknown) {
      this.calls.push(['fitBounds', b, o]);
    }
    easeTo(o: unknown) {
      this.calls.push(['easeTo', o]);
    }
    getZoom() {
      return (this.opts as unknown as { zoom: number }).zoom;
    }
    getCenter() {
      return { toArray: () => [25, 45.9] };
    }
    /** Around Ion's bloc 286 at Măldăeni, a few hundred metres each way. */
    getBounds() {
      return { getWest: () => 24.958, getSouth: () => 44.108, getEast: () => 24.966, getNorth: () => 44.114 };
    }
    getStyle() {
      return { glyphs: 'https://fonts.example/{fontstack}/{range}.pbf' };
    }
    off() {
      return this;
    }
    setFilter(id: string, f: unknown) {
      this.calls.push(['setFilter', id, f]);
    }
    /** What a tap finds: `hitBy` per layer when set, else `hit` for the parcel layers. */
    hitBy: Record<string, unknown[]> = {};
    queryRenderedFeatures(_p: unknown, o?: { layers?: string[] }) {
      const by = (o?.layers ?? []).flatMap((l) => this.hitBy[l] ?? []);
      if (by.length) return by;
      return o?.layers?.includes('cc-blocs-fill') ? [] : this.hit;
    }
    getCanvas() {
      return { style: {} };
    }
    resize() {}
    remove() {}
  }
  class Marker {
    el: HTMLElement;
    p: unknown;
    constructor(o: { element: HTMLElement }) {
      this.el = o.element;
      fake.markers.push(this);
    }
    setLngLat(p: unknown) {
      this.p = p;
      return this;
    }
    addTo(map: { opts: { container: HTMLElement } }) {
      map.opts.container.appendChild(this.el);
      return this;
    }
    remove() {
      this.el.remove();
      fake.markers.splice(fake.markers.indexOf(this), 1);
    }
  }
  return { default: { Map, Marker } };
});

const BASE = { version: 8, sources: { openmaptiles: { type: 'vector' } }, layers: [{ id: 'background', type: 'background' }, { id: 'label_city', type: 'symbol' }] };
let styleOk = true;
let reduced = false;

beforeEach(() => {
  styleOk = true;
  reduced = false;
  forgetBaseStyle();
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (styleOk ? { ok: true, json: async () => BASE } : Promise.reject(new TypeError('offline')))),
  );
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && reduced, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  fake.maps.length = 0;
  fake.markers.length = 0;
  vi.unstubAllGlobals();
});

const [bloc] = parseBlocs(bloc286);
const crops = [
  { id: 'grau', genus: 'Triticum' },
  { id: 'porumb', genus: 'Zea' },
];
const rowsOf = (n: number): PlotRow[] =>
  buildPlotRows({
    year: 2027,
    today: '2026-11-15',
    plots: Array.from({ length: n }, (_, i) => plot(`p${i}`, { name: `Parcela ${i + 1}`, geometry: bloc!.geometry })),
    seasons: Array.from({ length: n }, (_, i) => season(`p${i}`, i % 2 ? 'porumb' : 'grau', 300)),
    operations: [op('1', 'p0', { status: 'planned', on_date: '2026-11-01' })],
    transactions: [],
    crops: [
      { id: 'grau', sowing_month: 10, harvest_month: 7 },
      { id: 'porumb', sowing_month: 4, harvest_month: 9 },
    ],
  });

async function show(over: Partial<FarmMapProps> = {}) {
  const onSelect = vi.fn();
  const ref = createRef<FarmMapHandle>();
  const props: FarmMapProps = {
    rows: rowsOf(2),
    crops,
    onSelect,
    names: { cropName: (id) => ({ grau: 'Grâu', porumb: 'Porumb' })[id] ?? id, plotTitle: (r) => r.plot.name ?? '' },
    today: '2026-11-15',
    soonDays: 30,
    ...over,
  };
  const view = render(<FarmMap ref={ref} {...props} />);
  await settle();
  return { onSelect, ref, map: fake.maps[0]!, rerender: (p: Partial<FarmMapProps>) => view.rerender(<FarmMap ref={ref} {...props} {...p} />) };
}
const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  });
const fits = (m: FakeMap) => m.calls.filter((c) => c[0] === 'fitBounds');

describe('the farm map', () => {
  it('draws the parcels under the labels, with a crop icon each, and opens on them', async () => {
    const { map, onSelect } = await show();
    expect(map.opts.style.projection).toEqual({ type: 'globe' });
    expect(map.sources['cc-plots']!.data!.features).toHaveLength(2);
    expect(Object.keys(map.layers)).toContain('cc-plots-3d');
    expect(map.calls.some((c) => c[0] === 'setTerrain')).toBe(false);
    expect(fits(map)[0]![2]).toMatchObject({ pitch: 55, duration: 0 });
    const icon = screen.getByRole('button', { name: 'Parcela 2' });
    expect(icon.textContent).toBe('🌽');
    fireEvent.click(icon);
    expect(onSelect).toHaveBeenCalledWith('p1');
    expect(screen.getByRole('button', { name: 'Legendă' })).toBeTruthy();
    expect(screen.getByText('Grâu')).toBeTruthy();
  });

  it('a tap on a parcel selects it; a tap on empty land clears the choice', async () => {
    const { map, onSelect } = await show();
    map.hit = [{ properties: { id: 'p0' } }];
    map.fire('click', { point: { x: 1, y: 1 } });
    expect(onSelect).toHaveBeenLastCalledWith('p0');
    map.hit = [];
    map.fire('click', { point: { x: 1, y: 1 } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('flies to one parcel or fits several, from the page', async () => {
    const { map, ref } = await show();
    act(() => ref.current!.flyToPlot('p0'));
    expect(fits(map).at(-1)![2]).toMatchObject({ pitch: 55, duration: 1600 });
    act(() => ref.current!.fitPlots(['p0', 'p1']));
    expect(fits(map)).toHaveLength(3);
  });

  it('dims what the filters leave out and marks the selected parcel', async () => {
    const { map } = await show({ dimmedIds: ['p1'], selectedIds: ['p0'] });
    const props = map.sources['cc-plots']!.data!.features.map((f) => [f.properties.dim, f.properties.selected]);
    expect(props).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(screen.getByRole('button', { name: 'Parcela 2' }).className).toMatch(/\bdim\b/);
    expect(screen.getByRole('button', { name: 'Parcela 1' }).className).toMatch(/\bon\b/);
  });

  it('colours by result or by the next work, with a legend to match', async () => {
    await show();
    fireEvent.change(screen.getByLabelText('Culoare după'), { target: { value: 'nextTreatment' } });
    await settle();
    expect(screen.getByText('Lucrări întârziate')).toBeTruthy();
    expect(screen.getByText('Nimic de făcut')).toBeTruthy();
  });

  it('the globe flight plays once a session, and never under reduced motion', async () => {
    let { map } = await show({ intro: true });
    expect(map.opts.zoom).toBe(1.2);
    expect(map.calls.find((c) => c[0] === 'flyTo')).toEqual(['flyTo', expect.objectContaining({ zoom: 5.6, duration: 1100 })]);
    act(() => map.fire('moveend'));
    expect(fits(map)[0]![2]).toMatchObject({ duration: 1400 });
    cleanup();
    fake.maps.length = 0;
    ({ map } = await show({ intro: true }));
    expect(map.opts.zoom).toBe(6);

    sessionStorage.clear();
    reduced = true;
    cleanup();
    fake.maps.length = 0;
    ({ map } = await show({ intro: true }));
    expect(map.opts.zoom).toBe(6);
    expect(fits(map)[0]![2]).toMatchObject({ duration: 0 });
  });

  it('without internet: a plain background, the parcels anyway, and a note', async () => {
    styleOk = false;
    const { map } = await show();
    expect(map.opts.style.layers.map((l) => l.id)).toEqual(['background']);
    expect(map.sources['cc-plots']!.data!.features).toHaveLength(2);
    expect(screen.getByText(/Harta are nevoie de internet/)).toBeTruthy();
  });

  it('„Satelit” only with a key; „Blocuri APIA” adds the outlines layer', async () => {
    const { map, rerender } = await show();
    expect(screen.queryByRole('button', { name: 'Satelit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    expect(map.sources['cc-lpis']).toBeTruthy();
    rerender({ satelliteKey: 'pk_test' });
    fireEvent.click(screen.getByRole('button', { name: 'Satelit' }));
    expect(map.layers['cc-sat']!.layout.visibility).toBe('visible');
    fireEvent.click(screen.getByRole('button', { name: 'Satelit' }));
    expect(map.layers['cc-sat']!.layout.visibility).toBe('none');
  });

  it('„Blocuri APIA” zoomed out: says to come closer and takes the map there', async () => {
    const { map } = await show();
    expect(map.opts.zoom).toBeLessThan(LPIS_MIN_ZOOM);
    expect(screen.queryByText(/se văd doar de aproape/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    expect(screen.getByText(/se văd doar de aproape/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apropie harta' }));
    const ease = map.calls.find((c) => c[0] === 'easeTo')![1] as { zoom: number; center: number[] };
    expect(ease.zoom).toBeGreaterThanOrEqual(LPIS_MIN_ZOOM);
    expect(ease.center).toHaveLength(2);
    // Close enough: the note goes.
    map.opts.zoom = LPIS_MIN_ZOOM + 1;
    act(() => map.fire('zoomend'));
    expect(screen.queryByText(/se văd doar de aproape/)).toBeNull();
    // Turned off: no note even zoomed out.
    map.opts.zoom = 9;
    act(() => map.fire('zoomend'));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    expect(screen.queryByText(/se văd doar de aproape/)).toBeNull();
  });

  it('no parcel on the map: offers a drawing only when the page can save one', async () => {
    const onDrawNew = vi.fn();
    const { rerender } = await show({ rows: [] });
    expect(screen.getByText('Nicio parcelă nu e încă pe hartă.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Desenează o parcelă' })).toBeNull();
    rerender({ rows: [], onDrawNew });
    fireEvent.click(screen.getByRole('button', { name: 'Desenează o parcelă' }));
    expect(onDrawNew).toHaveBeenCalled();
  });

  it('„Blocuri APIA” with the API: loads the squares on screen as outlines, not APIA’s picture', async () => {
    const loadBlocTile = vi.fn(async () => [bloc!]);
    const { map } = await show({ loadBlocTile });
    map.opts.zoom = 15;
    act(() => map.fire('zoomend'));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    await settle();
    expect(loadBlocTile).toHaveBeenCalled();
    expect(loadBlocTile.mock.calls.length).toBeLessThanOrEqual(4);
    // Every square holds the same bloc: drawn once.
    expect(map.sources['cc-blocs']!.data!.features.map((f) => f.properties.fbid)).toEqual(['153277-286']);
    expect(map.layers['cc-blocs-label']).toBeTruthy();
    expect(map.sources['cc-lpis']).toBeUndefined();
    // Moving asks only for squares not loaded yet.
    const asked = loadBlocTile.mock.calls.length;
    act(() => map.fire('moveend'));
    await settle();
    expect(loadBlocTile.mock.calls.length).toBe(asked);
    // Off: hidden, not asked for.
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    expect(map.layers['cc-blocs-line']!.layout.visibility).toBe('none');
  });

  it('a tapped bloc shows its card and starts a drawing inside it; a parcel on top wins', async () => {
    const onDrawNew = vi.fn();
    const { map, onSelect } = await show({ loadBlocTile: async () => [bloc!], onDrawNew });
    map.opts.zoom = 15;
    act(() => map.fire('zoomend'));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    await settle();
    map.hitBy = { 'cc-blocs-fill': [{ properties: { fbid: '153277-286' } }] };
    act(() => map.fire('click', { point: { x: 1, y: 1 } }));
    const card = within(screen.getByRole('region', { name: 'Blocul fizic 286' }));
    expect(card.getByText('satul Măldăeni, comuna Măldăeni')).toBeTruthy();
    expect(card.getByText(/Teren arabil · 8,54 ha în tot blocul/)).toBeTruthy();
    expect(map.calls.filter((c) => c[0] === 'setFilter').at(-1)).toEqual(['setFilter', 'cc-blocs-picked', ['==', ['get', 'fbid'], '153277-286']]);
    fireEvent.click(card.getByRole('button', { name: 'Desenează parcela în blocul ăsta' }));
    expect(onDrawNew).toHaveBeenCalledWith(expect.objectContaining({ fbid: '153277-286' }));
    // A parcel over the bloc: the parcel is picked, the bloc card goes.
    map.hit = [{ properties: { id: 'p0' } }];
    act(() => map.fire('click', { point: { x: 1, y: 1 } }));
    expect(onSelect).toHaveBeenLastCalledWith('p0');
    expect(screen.queryByRole('region', { name: 'Blocul fizic 286' })).toBeNull();
  });

  it('„Blocuri APIA” when the API can’t give the blocs: APIA’s picture instead', async () => {
    const { map } = await show({
      loadBlocTile: async () => {
        throw new Error('503');
      },
    });
    map.opts.zoom = 15;
    act(() => map.fire('zoomend'));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    await settle();
    expect(map.layers['cc-lpis']!.layout.visibility).toBe('visible');
  });

  it('„Blocuri APIA” when APIA does not answer: says so, and tries again on the next press', async () => {
    const { map } = await show();
    map.opts.zoom = 15;
    act(() => map.fire('zoomend'));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    act(() => map.fire('error', { sourceId: 'cc-lpis' }));
    expect(screen.getByText(/Harta APIA nu răspunde acum/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blocuri APIA' }));
    expect(screen.queryByText(/Harta APIA nu răspunde acum/)).toBeNull();
  });

  it(`above ${MARKER_LIMIT} parcels the icons are one map layer, not ${MARKER_LIMIT + 1} buttons`, async () => {
    const { map } = await show({ rows: rowsOf(MARKER_LIMIT + 1) });
    expect(fake.markers).toHaveLength(0);
    expect(map.layers['cc-icons']!.layout.visibility).toBe('visible');
  });

  it('the mini map: flat, still, no tools', async () => {
    const { map } = await show({ mode: 'mini', intro: true });
    expect(map.opts.interactive).toBe(false);
    expect(map.opts.style.projection).toBeUndefined();
    expect(fits(map)[0]![2]).toMatchObject({ pitch: 0 });
    expect(screen.queryByRole('group', { name: 'Harta' })).toBeNull();
    expect(fake.markers).toHaveLength(0);
  });
});
