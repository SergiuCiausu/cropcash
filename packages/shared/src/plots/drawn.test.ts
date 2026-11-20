import { describe, expect, it } from 'vitest';
import { drawnPlotInput, unplacedChange } from './drawn';
import { PlotInputSchema, type PlotGeometry, type Shape } from './model';

const ring: [number, number][] = [
  [24.96, 44.11],
  [24.97, 44.11],
  [24.97, 44.12],
  [24.96, 44.11],
];
const geometry: PlotGeometry = { type: 'Polygon', coordinates: [ring] };
const shape: Shape = { vertices: ring.slice(0, 3).map((at) => ({ at })), edges: [{ type: 'line' }, { type: 'line' }, { type: 'line' }] } as Shape;

describe('drawnPlotInput', () => {
  it('is a drawn parcel with this year’s crop on the drawn area, valid for save_plots', () => {
    const input = drawnPlotInput({ name: '  La salcâmi ', county: 'CT', shape, geometry, areaAri: 412, cropId: 'floarea-soarelui' });
    expect(input).toEqual({
      name: 'La salcâmi',
      county: 'CT',
      shape,
      geometry,
      geometrySource: 'drawn',
      season: { cropId: 'floarea-soarelui', areaAri: 412 },
    });
    expect(PlotInputSchema.safeParse(input).success).toBe(true);
  });

  it('no name is null; nothing sown is a season without a crop', () => {
    const input = drawnPlotInput({ name: ' ', county: 'TR', shape, geometry, areaAri: 50, cropId: null });
    expect(input).toMatchObject({ name: null, season: { cropId: null, areaAri: 50 } });
    expect(PlotInputSchema.safeParse(input).success).toBe(true);
  });

  it('a drawing with no area is not saved', () => {
    expect(drawnPlotInput({ name: '', county: 'TR', shape, geometry, areaAri: 0, cropId: 'grau' })).toBeNull();
  });

  it('drawn inside an APIA bloc: keeps the bloc, its code and its land use', () => {
    const input = drawnPlotInput({ name: '', county: 'TR', shape, geometry, areaAri: 300, cropId: 'grau', bloc: { fbid: '153277-286', siruta: 153277, bloc: '286', landUse: 'TA' } });
    expect(input).toMatchObject({ lpisFbid: '153277-286', siruta: 153277, blocFizic: '286', landUse: 'TA', geometrySource: 'drawn' });
    expect(PlotInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('unplacedChange', () => {
  it('takes the drawn hectares out of the unplaced ones', () => {
    expect(unplacedChange(200, 600, 'grau', true)).toEqual({ kind: 'shrinks', leftAri: 400 });
    expect(unplacedChange(600, 600, 'grau', true)).toEqual({ kind: 'all' });
    expect(unplacedChange(650, 600, 'grau', true)).toEqual({ kind: 'grows', moreAri: 50 });
    expect(unplacedChange(300, 0, 'grau', true)).toEqual({ kind: 'grows', moreAri: 300 });
  });

  it('says nothing without a crop or for another year', () => {
    expect(unplacedChange(200, 600, null, true)).toBeNull();
    expect(unplacedChange(200, 600, 'grau', false)).toBeNull();
  });
});
