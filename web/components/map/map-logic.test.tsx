/* The farm map's pure parts (docs/harta-plan.md, step 7): crop looks, the cartoon style, and what each
   parcel becomes on the map. */
import { describe, expect, it } from 'vitest';
import { expense, op, plot, sale, season } from '../../../packages/shared/src/plots/fixtures';
import { buildPlotRows, parseBlocs } from '../../../packages/shared/src/plots/index';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import { boxOf, legendOf, plotFeatures, todoLevel, whereOf, type FeatureOptions } from './features';
import { cropLook, FALLOW, NO_CROP, resultColor, RESULT, TODO_COLORS } from './palette';
import { cartoonStyle, DEM_TILES, firstLabelLayer, ROMANIAN_NAME, type StyleJson } from './style';

const crops = [
  { id: 'grau', genus: 'Triticum' },
  { id: 'porumb', genus: 'Zea' },
  { id: 'floarea-soarelui', genus: 'Helianthus' },
  { id: 'cartof-timpuriu', genus: 'Solanum' },
  { id: 'teren-necultivat', genus: null, kind: 'fallow' as const },
  { id: 'own-x', genus: null },
];
const cropMap = new Map(crops.map((c) => [c.id, c]));

describe('crop looks', () => {
  it('by genus: wheat stripes, maize dots, sunflower ring, potatoes with their own icon', () => {
    expect(cropLook(cropMap.get('grau'))).toMatchObject({ pattern: 'stripes', icon: '🌾' });
    expect(cropLook(cropMap.get('porumb'))).toMatchObject({ pattern: 'dots', icon: '🌽' });
    expect(cropLook(cropMap.get('floarea-soarelui'))).toMatchObject({ pattern: 'ring', icon: '🌻' });
    expect(cropLook(cropMap.get('cartof-timpuriu')).icon).toBe('🥔');
    expect(cropLook(cropMap.get('teren-necultivat'))).toBe(FALLOW);
    expect(cropLook(undefined)).toBe(NO_CROP);
  });

  it('a crop of no known genus keeps the same pastel every time', () => {
    const a = cropLook({ id: 'own-x', genus: null });
    expect(a).toEqual(cropLook({ id: 'own-x', genus: null }));
    expect(a.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('result: pink for a loss, green for a gain, stronger further from zero, grey without money', () => {
    expect(resultColor(null, 100)).toBe(RESULT.none);
    expect(resultColor(0, 100)).toBe(RESULT.zero);
    expect(resultColor(-100, 100)).toBe(RESULT.loss);
    expect(resultColor(100, 100)).toBe(RESULT.gain);
    expect(resultColor(10, 100)).not.toBe(resultColor(90, 100));
  });
});

describe('the cartoon style', () => {
  const base: StyleJson = {
    version: 8,
    sources: { openmaptiles: { type: 'vector' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
      { id: 'water', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': 'blue' } },
      { id: 'road_minor', type: 'line', source: 'openmaptiles', paint: { 'line-color': 'grey', 'line-width': 2 } },
      { id: 'road_minor_casing', type: 'line', source: 'openmaptiles', paint: { 'line-color': 'black' } },
      { id: 'label_village', type: 'symbol', source: 'openmaptiles', paint: { 'text-color': 'black' } },
    ],
  };

  it('recolours the base layers, keeps their other paint, and leaves the original alone', () => {
    const s = cartoonStyle(base, { globe: true, hillshade: true });
    const byId = new Map(s.layers.map((l) => [l.id, l]));
    expect(byId.get('water')!.paint!['fill-color']).not.toBe('blue');
    expect(byId.get('road_minor')!.paint!['line-width']).toBe(2);
    expect(byId.get('road_minor')!.paint!['line-color']).not.toBe(byId.get('road_minor_casing')!.paint!['line-color']);
    expect(base.layers[1]!.paint!['fill-color']).toBe('blue');
    expect(s.projection).toEqual({ type: 'globe' });
    expect(s.sky).toBeTruthy();
  });

  it('puts farmland and the hillshade just above the background, under everything else', () => {
    const s = cartoonStyle(base, { globe: false, hillshade: true });
    expect(s.layers.map((l) => l.id).slice(0, 3)).toEqual(['background', 'cc-farmland', 'cc-hillshade']);
    expect(s.sources['cc-dem']).toMatchObject({ type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium' });
    expect(s.projection).toBeUndefined();
    expect(firstLabelLayer(s)).toBe('label_village');
    expect(s.layers.find((l) => l.id === 'label_village')!.layout!['text-field']).toEqual(ROMANIAN_NAME);
  });

  it('without the base style (no internet): a plain background, so the parcels still show', () => {
    const s = cartoonStyle(null, { globe: false, hillshade: false });
    expect(s.layers.map((l) => l.type)).toEqual(['background']);
    expect(Object.keys(s.sources)).toEqual([]);
  });
});

describe('parcels on the map', () => {
  const TODAY = '2026-11-15';
  const [bloc] = parseBlocs(bloc286);
  const rows = buildPlotRows({
    year: 2027,
    today: TODAY,
    plots: [
      plot('a', { geometry: bloc!.geometry }),
      plot('b', { geometry: bloc!.geometry, geometry_source: 'approx' }),
      plot('c', { geometry_source: 'approx', centroid_lng: 24.9, centroid_lat: 44.1 }),
      plot('d', { geometry_source: 'none' }),
    ],
    seasons: [season('a', 'grau', 800), season('b', 'porumb', 300), season('c', 'floarea-soarelui', 200), season('d', 'grau', 100)],
    operations: [op('1', 'a', { status: 'planned', on_date: '2026-11-01' }), op('2', 'b', { status: 'planned', on_date: '2026-12-01' })],
    transactions: [expense(100_000, { plot_id: 'a' }), sale(50_000, { plot_id: 'b' })],
    crops: [
      { id: 'grau', sowing_month: 10, harvest_month: 7 },
      { id: 'porumb', sowing_month: 4, harvest_month: 9 },
      { id: 'floarea-soarelui', sowing_month: 4, harvest_month: 9 },
    ],
  });
  const opts = (over: Partial<FeatureOptions> = {}): FeatureOptions => ({ crops: cropMap, colorBy: 'crop', selected: new Set(), dimmed: new Set(), today: TODAY, soonDays: 30, ...over });

  it('an outline, a rough outline, a rough point, or nothing', () => {
    expect(rows.map((r) => (whereOf(r) ? Object.keys(whereOf(r)!)[0] : null))).toEqual(['geometry', 'geometry', 'point', null]);
    const f = plotFeatures(rows, opts());
    expect(f.areas.features.map((x) => [x.properties.id, x.properties.approx])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(f.points.features.map((x) => x.properties.id)).toEqual(['c']);
    // A rough place gets no crop icon: it would claim a spot we don't know.
    expect(f.icons.map((i) => [i.id, i.icon])).toEqual([['a', '🌾']]);
    expect([...f.boxes.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('dims, selects, and makes one pattern image per pattern and colour', () => {
    const f = plotFeatures(rows, opts({ selected: new Set(['a']), dimmed: new Set(['b', 'c']) }));
    expect(f.areas.features.map((x) => [x.properties.selected, x.properties.dim])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(f.points.features[0]!.properties.dim).toBe(1);
    expect(f.patterns.map((p) => p.pattern).sort()).toEqual(['dots', 'ring', 'stripes']);
    expect(new Set(f.areas.features.map((x) => x.properties.patternId)).size).toBe(2);
  });

  it('colours by result and by the next work, without crop patterns', () => {
    const byResult = plotFeatures(rows, opts({ colorBy: 'result' }));
    const [a, b] = byResult.areas.features.map((x) => x.properties);
    // b has the biggest result per hectare, so the full green; a's smaller loss is a lighter pink.
    expect(b!.color).toBe(RESULT.gain);
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    expect(rgb(a!.color)[0]!).toBeGreaterThan(rgb(a!.color)[1]!);
    expect(a!.color).not.toBe(RESULT.loss);
    expect(byResult.patterns.every((p) => p.pattern === 'none')).toBe(true);
    expect(rows.map((r) => todoLevel(r, TODAY, 30))).toEqual(['overdue', 'soon', 'none', 'none']);
    const byWork = plotFeatures(rows, opts({ colorBy: 'nextTreatment' }));
    expect(byWork.areas.features.map((x) => x.properties.color)).toEqual([TODO_COLORS.overdue, TODO_COLORS.soon]);
  });

  it('boxes to fly to: one parcel, several, or all', () => {
    const f = plotFeatures(rows, opts());
    const all = boxOf(f.boxes)!;
    expect(boxOf(f.boxes, ['c'])).toEqual({ west: 24.9, south: 44.1, east: 24.9, north: 44.1 });
    expect(all.west).toBe(24.9);
    expect(all.east).toBeGreaterThan(24.95);
    expect(boxOf(f.boxes, ['d'])).toBeNull();
    expect(boxOf(new Map())).toBeNull();
  });

  it('the legend names only what is on the map', () => {
    const names = (id: string) => ({ grau: 'Grâu', porumb: 'Porumb', 'floarea-soarelui': 'Floarea-soarelui' })[id] ?? id;
    expect(legendOf(rows, opts(), names).map((l) => l.label)).toEqual(['Grâu', 'Porumb', 'Floarea-soarelui']);
    expect(legendOf(rows, opts({ colorBy: 'nextTreatment' }), names).map((l) => l.label)).toEqual(['Lucrări întârziate', 'De făcut în 30 de zile', 'Nimic de făcut']);
  });
});
