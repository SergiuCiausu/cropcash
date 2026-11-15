import { describe, expect, it } from 'vitest';
import { loadPlotsParams } from './params';
import { OperationPatchSchema, UpdatePlotInputSchema, operationToRow, plotToRow } from './wire';

const SEGMENTS = loadPlotsParams().curve_segments.value;
const ID = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const square = { type: 'Polygon' as const, coordinates: [[[25, 44], [25.01, 44], [25.01, 44.01], [25, 44.01], [25, 44]] as [number, number][]] };

describe('parcel rows for save_plots', () => {
  it('sends only the keys given, in snake_case, so the rest stays as saved', () => {
    expect(plotToRow({ id: ID, name: 'La pădure' }, SEGMENTS)).toEqual({ id: ID, name: 'La pădure' });
    expect(plotToRow({ blocFizic: '286', parcelNo: '1a', siruta: 153277, lpisFbid: '153277-286', landUse: 'TA', villageSiruta: 153286 }, SEGMENTS)).toEqual({
      bloc_fizic: '286',
      parcel_no: '1a',
      siruta: 153277,
      lpis_fbid: '153277-286',
      land_use: 'TA',
      village_siruta: 153286,
    });
  });

  it('works out the centroid from the outline, and clears it with the outline', () => {
    const row = plotToRow({ geometry: square, geometrySource: 'lpis' }, SEGMENTS);
    expect(row).toMatchObject({ geometry: square, geometry_source: 'lpis', centroid_lng: 25.005 });
    expect(row.centroid_lat).toBeCloseTo(44.005, 4);
    expect(plotToRow({ id: ID, geometry: null }, SEGMENTS)).toEqual({ id: ID, geometry: null, centroid_lat: null, centroid_lng: null, geometry_source: 'none' });
  });

  it('turns a drawn shape into its polygon, ignoring any polygon sent beside it', () => {
    const shape = {
      vertices: [{ at: [25, 44] as [number, number] }, { at: [25.01, 44] as [number, number], cornerM: 20 }, { at: [25.01, 44.01] as [number, number] }],
      edges: [{ type: 'line' as const }, { type: 'quad' as const, c: [25.02, 44.005] as [number, number] }, { type: 'line' as const }],
    };
    const row = plotToRow({ shape, geometry: square, geometrySource: 'drawn' }, SEGMENTS);
    expect(row.shape).toEqual(shape);
    expect(row.geometry).not.toEqual(square);
    const ring = (row.geometry as typeof square).coordinates[0]!;
    expect(ring.length).toBeGreaterThan(2 * SEGMENTS);
    expect(ring[0]).toEqual(ring.at(-1));
  });

  it('maps the season, and null for "nothing grows here this year"', () => {
    expect(plotToRow({ id: ID, season: { cropId: 'grau', areaAri: 800, sownOn: '2026-10-10' } }, SEGMENTS).season).toEqual({
      crop_id: 'grau',
      apia_crop_code: null,
      area_ari: 800,
      sown_on: '2026-10-10',
      harvested_on: null,
      second_crop_id: null,
    });
    expect(plotToRow({ id: ID, season: null }, SEGMENTS)).toEqual({ id: ID, season: null });
  });

  it('a one-parcel change needs its year and keeps the id out of the body', () => {
    expect(UpdatePlotInputSchema.safeParse({ id: ID, harvestYear: 2027, plot: { name: 'Lunca' } }).success).toBe(true);
    expect(UpdatePlotInputSchema.safeParse({ id: ID, plot: { name: 'Lunca' } }).success).toBe(false);
    expect(UpdatePlotInputSchema.safeParse({ id: ID, harvestYear: 2027, plot: { id: ID } }).success).toBe(false);
  });
});

describe('operation rows', () => {
  it('a new operation carries its parcel, year and client id', () => {
    expect(
      operationToRow({ plotId: ID, harvestYear: 2027, kind: 'herbicide', status: 'done', onDate: '2026-11-02', product: 'Erbicid X', clientId: ID }),
    ).toEqual({ plot_id: ID, harvest_year: 2027, client_id: ID, kind: 'herbicide', status: 'done', on_date: '2026-11-02', product: 'Erbicid X' });
  });

  it('a change carries only what changed; done can\'t clear the date', () => {
    expect(operationToRow({ status: 'done', onDate: '2026-11-14' })).toEqual({ status: 'done', on_date: '2026-11-14' });
    expect(operationToRow({ product: null })).toEqual({ product: null });
    expect(OperationPatchSchema.safeParse({ id: ID, status: 'done', onDate: null }).success).toBe(false);
    expect(OperationPatchSchema.safeParse({ id: ID, plotId: ID }).success).toBe(false);
  });
});
