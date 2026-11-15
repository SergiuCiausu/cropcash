// @vitest-environment happy-dom
/* The farm map (docs/harta-plan.md, step 7), with MapLibre replaced by a fake that keeps what the map is
   given: style, sources, layers, camera moves and markers. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { op, plot, season } from '../../../packages/shared/src/plots/fixtures';
import { buildPlotRows, parseBlocs, type PlotRow } from '../../../packages/shared/src/plots/index';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import { FarmMap, forgetBaseStyle, MARKER_LIMIT, type FarmMapHandle, type FarmMapProps } from './FarmMap';

type Call = [string, ...unknown[]];
interface FakeMap {
  opts: { zoom: number; interactive: boolean; style: { layers: { id: string }[]; projection?: unknown } };
  calls: Call[];
  sources: Record<string, { data?: { features: { properties: Record<string, unknown> }[] } }>;
  layers: Record<string, { layout: Record<string, unknown>; paint: Record<string, unknown> }>;
  fire(ev: string, e?: unknown): void;
  hit: unknown[];
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
    queryRenderedFeatures() {
      return this.hit;
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
