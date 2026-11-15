import { describe, expect, it } from 'vitest';
import lpis from '../../../../docs/data/lpis.json';
import bloc286 from './__fixtures__/lpis-bloc-153277-286.json';
import blocMissing from './__fixtures__/lpis-bloc-missing.json';
import communesTR from './__fixtures__/lpis-communes-TR.json';
import extent from './__fixtures__/lpis-extent-153277.json';
import extentNone from './__fixtures__/lpis-extent-none.json';
import { containsPoint } from './geometry';
import { lpisOverlayTiles, lpisQueries, parseBlocs, parseCommunes, parseExtentCentre, placeParcel, placementCentre, searchCommunes } from './lpis';
import { loadPlotsParams } from './params';
import { plotToRow } from './wire';

/* The fixtures are APIA's own answers, saved on 2026-11-14 (Ion's demo bloc, docs/harta-plan.md step 0). */
const q = lpisQueries(lpis.service_url);
/** The query string of a built URL, as a map. */
const params = (url: string) => Object.fromEntries(url.split('?')[1]!.split('&').map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]));
const WARN = loadPlotsParams().area_warning_pct.value;

describe('questions for APIA', () => {
  it('asks only with checked values', () => {
    const url = q.bloc('153277-286');
    expect(url.split('?')[0]).toBe(`${lpis.service_url}/query`);
    expect(params(url)).toMatchObject({ where: "fbid='153277-286'", f: 'geojson' });
    expect(() => q.bloc("153277-286' or '1'='1")).toThrow();
    expect(() => q.communes("TR' or 1=1 --")).toThrow();
    expect(() => q.communeExtent(1.5)).toThrow();
    expect(params(q.at([24.9622, 44.1162])).geometry).toBe('24.962200,44.116200');
    expect(() => q.at([200, 44])).toThrow();
  });
});

describe('the bloc outlines layer', () => {
  it('asks the MapServer for outlines only, leaving MapLibre its bbox placeholder', () => {
    const url = lpisOverlayTiles(lpis.service_url, [60, 90, 40]);
    expect(url.startsWith(lpis.service_url.replace(/\/0$/, '') + '/export?bbox={bbox-epsg-3857}&')).toBe(true);
    const layers = JSON.parse(decodeURIComponent(url.split('dynamicLayers=')[1]!));
    expect(layers[0].drawingInfo.renderer.symbol).toMatchObject({ style: 'esriSFSNull', outline: { color: [60, 90, 40, 230] } });
    expect(layers[0].drawingInfo.showLabels).toBe(false);
  });
});

describe('answers from APIA', () => {
  const [bloc] = parseBlocs(bloc286);

  it('reads a bloc: id, UAT, land use, net area in ari, outline', () => {
    expect(bloc).toMatchObject({ fbid: '153277-286', siruta: 153277, bloc: '286', county: 'TR', commune: 'MALDAENI', landUse: 'TA', netAreaAri: 854 });
    expect(containsPoint(bloc!.geometry, [24.9622, 44.1162])).toBe(true);
    expect(parseBlocs(blocMissing)).toEqual([]);
    expect(() => parseBlocs({ error: { code: 400 } })).toThrow();
  });

  it('leaves out a feature it cannot read instead of guessing', () => {
    const broken = { features: [{ geometry: { type: 'Polygon', coordinates: [] }, properties: { fbid: '1-2' } }, (bloc286 as { features: unknown[] }).features[0]] };
    expect(parseBlocs(broken).map((b) => b.fbid)).toEqual(['153277-286']);
  });

  it("reads a county's UATs, in Romanian order, findable without diacritics", () => {
    const list = parseCommunes(communesTR);
    expect(list.length).toBeGreaterThan(90);
    expect(list).toContainEqual({ siruta: 153277, name: 'Maldaeni' });
    expect(new Set(list.map((c) => c.siruta)).size).toBe(list.length);
    expect(searchCommunes(list, 'Măldăeni')).toEqual([{ siruta: 153277, name: 'Maldaeni' }]);
    expect(searchCommunes(list, '153277')).toEqual([{ siruta: 153277, name: 'Maldaeni' }]);
    const al = searchCommunes(list, 'al');
    expect(al[0]!.name.toLowerCase().startsWith('al')).toBe(true);
  });

  it("finds the middle of a UAT's blocs, and nothing for a UAT without any", () => {
    const centre = parseExtentCentre(extent)!;
    expect(centre[0]).toBeCloseTo(24.906375, 5);
    expect(centre[1]).toBeCloseTo(44.111895, 5);
    expect(parseExtentCentre(extentNone)).toBeNull();
  });
});

describe('where a parcel goes', () => {
  const [bloc] = parseBlocs(bloc286);

  it('is the whole bloc only when the areas agree', () => {
    // 8,00 ha on paper, 8,54 ha bloc: 6% apart, within area_warning_pct.
    expect(placeParcel(800, bloc!, null, WARN)).toMatchObject({ source: 'lpis', fit: 'whole' });
    // 3 ha in an 8,54 ha bloc: somewhere inside, shown as such.
    expect(placeParcel(300, bloc!, null, WARN)).toMatchObject({ source: 'approx', fit: 'in_bloc', geometry: bloc!.geometry });
    expect(placeParcel(null, bloc!, null, WARN).fit).toBe('in_bloc');
  });

  it("falls back to the UAT's middle, then to nothing", () => {
    const centre = parseExtentCentre(extent)!;
    const rough = placeParcel(800, null, centre, WARN);
    expect(rough).toEqual({ source: 'approx', geometry: null, centre, fit: 'in_commune', bloc: null });
    expect(placementCentre(rough)).toEqual(centre);
    expect(placeParcel(800, null, null, WARN)).toMatchObject({ source: 'none', fit: 'none' });
  });

  it('a rough place is saved as the centroid, with no outline', () => {
    const row = plotToRow({ geometry: null, centre: [24.906375, 44.111895], geometrySource: 'approx' }, 16);
    expect(row).toEqual({ geometry: null, centroid_lng: 24.906375, centroid_lat: 44.111895, geometry_source: 'approx' });
  });
});
