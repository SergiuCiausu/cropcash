import { describe, expect, it } from 'vitest';
import trCt from '../../../../docs/data/siruta-tr-ct.json';
import bloc286 from './__fixtures__/lpis-bloc-153277-286.json';
import { parseBlocs } from './lpis';
import { countyCountQuery, countyPageQuery, pageOffsets, parseBlocPage, parseCount } from './lpis-import';
import type { Polygon, Position } from './model';
import { placesFromFile, type Place } from './siruta';
import { distanceM, distanceText, plotVillage, villageForBloc, whereText } from './village';

/* A small commune: three villages along a road, 1 km apart, around blocs drawn as 200 m squares. */
const square = ([lng, lat]: Position, half = 0.0013): Polygon => ({
  type: 'Polygon',
  coordinates: [[[lng - half, lat - half], [lng + half, lat - half], [lng + half, lat + half], [lng - half, lat + half], [lng - half, lat - half]]],
});
const C = 500000;
const place = (siruta: number, name: string, kind: Place['kind'], at?: Position): Place => ({ siruta, name, kind, seat: false, county: 'TR', parent: C, commune: C, ...(at ? { at } : {}) });
const places: Place[] = [
  place(C, 'Deal', 'commune'),
  place(500001, 'Sus', 'village', [25.0, 44.0]),
  place(500002, 'Mijloc', 'village', [25.0125, 44.0]),
  place(500003, 'Jos', 'village', [25.025, 44.0]),
];
const byCode = new Map(places.map((p) => [p.siruta, p]));

describe('which village a bloc points to', () => {
  it('a commune with one village: that one, inside it or not', () => {
    const tr = placesFromFile(trCt);
    const [b] = parseBlocs(bloc286);
    const pick = villageForBloc({ commune: 153277, geometry: b!.geometry }, [...tr.values()]);
    expect(pick).toMatchObject({ siruta: 153286, method: 'only_village' });
    expect(pick!.distanceM).toBeGreaterThan(0);
    expect(whereText(153277, pick, tr)).toBe('satul Măldăeni, comuna Măldăeni');
  });

  it('touching a village’s built-up area: that village', () => {
    const bloc = square([25.02, 44.003]);
    const areas = [{ siruta: 500003, geometry: square([25.022, 44.003], 0.002) }];
    expect(villageForBloc({ commune: C, geometry: bloc }, places, areas)).toEqual({ siruta: 500003, method: 'inside_locality', distanceM: 0 });
  });

  it('otherwise the nearest village, with how far', () => {
    const bloc = square([25.011, 44.004]);
    const pick = villageForBloc({ commune: C, geometry: bloc }, places);
    expect(pick?.siruta).toBe(500002);
    expect(pick?.method).toBe('nearest');
    expect(pick!.distanceM).toBeGreaterThan(400);
    expect(pick!.distanceM).toBeLessThan(500);
    expect(whereText(C, pick, byCode)).toBe('lângă satul Mijloc (500 m), comuna Deal');
  });

  it('a village with no point can’t be nearest; no village known gives nothing', () => {
    const noPoints = places.map((p) => ({ ...p, at: undefined }));
    expect(villageForBloc({ commune: C, geometry: square([25.011, 44.004]) }, noPoints)).toBeNull();
    expect(villageForBloc({ commune: 1, geometry: square([25, 44]) }, places)).toBeNull();
    expect(whereText(C, null, byCode)).toBe('comuna Deal');
  });

  it('the cerere’s village beats the worked-out one', () => {
    const computed = { siruta: 500002, method: 'nearest' as const, distanceM: 450 };
    expect(plotVillage(500001, computed)).toEqual({ siruta: 500001, method: 'paper', distanceM: null });
    expect(plotVillage(null, computed)).toBe(computed);
    expect(whereText(C, plotVillage(500001, computed), byCode)).toBe('satul Sus, comuna Deal');
  });

  it('distances read as the app says them', () => {
    expect(Math.round(distanceM([25, 44], [25, 44.01]))).toBe(1112);
    expect(distanceText(1234)).toBe('1,2 km');
    expect(distanceText(430)).toBe('400 m');
    expect(distanceText(20)).toBe('100 m');
  });
});

describe('the bulk copy of a county’s blocs', () => {
  const S = 'https://inspire.apia.org.ro/x/MapServer/0';

  it('asks for the count, then pages in a fixed order', () => {
    expect(countyCountQuery(S, 'TR')).toContain('returnCountOnly=true');
    const page = decodeURIComponent(countyPageQuery(S, 'TR', 2000));
    expect(page).toContain("where=judet='TR'");
    expect(page).toContain('orderByFields=OBJECTID');
    expect(page).toContain('resultOffset=2000');
    expect(page).toContain('fol_sec_tr');
    expect(() => countyPageQuery(S, "TR' or 1=1", 0)).toThrow();
    expect(pageOffsets(21424)).toHaveLength(22);
    expect(pageOffsets(1000)).toEqual([0]);
    expect(parseCount({ count: 21424 })).toBe(21424);
    expect(() => parseCount({ error: {} })).toThrow();
  });

  it('keeps hectares as whole square metres, and reports what it can’t store', () => {
    const geometry = square([25, 44]);
    const page = parseBlocPage(
      {
        features: [
          { geometry, properties: { fbid: '153277-286', judet: 'TR', nume_com: 'MALDAENI', fol_pr_trn: 'TA', fol_sec_tr: null, aria_neta: 8.5405 } },
          { geometry, properties: { fbid: 'bad', aria_neta: 1 } },
          { geometry: null, properties: { fbid: '153277-1', judet: 'TR', aria_neta: 1 } },
          { geometry, properties: { fbid: '153277-2', judet: 'CT', aria_neta: 1 } },
          { geometry, properties: { fbid: '153277-3', judet: 'TR' } },
        ],
      },
      'TR',
    );
    expect(page.rows).toEqual([{ fbid: '153277-286', siruta: 153277, county: 'TR', uat_name: 'MALDAENI', land_use: 'TA', land_use_2: null, net_area_m2: 85_405, geometry }]);
    expect(page.skipped.map((s) => s.why)).toEqual(['bad_fbid', 'bad_geometry', 'no_county', 'no_area']);
    expect(() => parseBlocPage({ error: 1 }, 'TR')).toThrow();
  });
});
