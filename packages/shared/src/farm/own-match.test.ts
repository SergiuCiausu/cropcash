/* An own crop now on the APIA list (docs/crops-catalog-plan.md, step 11). */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { linkOwnCrop, MAX_OWN_MATCHES, ownCropMatches } from './own-match';
import type { OwnCrop } from './harvests';

const catalogue = loadData().catalogue;
const codes = (name: string, taken: string[] = []) => ownCropMatches({ name }, catalogue, taken).map((c) => c.code);

describe('which APIA lines an own crop may be', () => {
  it('a name APIA uses as it is gives that line, with or without diacritics', () => {
    expect(codes('Tomate')).toEqual([353]);
    expect(codes('Pruni')).toEqual([653]);
    expect(codes('orzoaica de primavara')).toEqual([1060]);
  });

  it('a short name gives the lines it starts, at most a few', () => {
    expect(codes('Ovăz')).toEqual([107, 1070]);
    expect(codes('Orz').length).toBeLessThanOrEqual(MAX_OWN_MATCHES);
    expect(codes('Orz')).toContain(105);
  });

  it('leaves out mixtures and energy crops when there are too many', () => {
    expect(codes('Rapiță')).toEqual([202, 2020]);
    expect(codes('Mazăre')).not.toContain(465); // MAZĂRE + OVĂZ
  });

  it('every word typed may stand apart in APIA\'s name', () => {
    expect(codes('Grâu de primăvară')).toEqual([1010, 1020]);
  });

  it('asks nothing for a crop already linked, a line already on the farm, or a name APIA doesn\'t have', () => {
    expect(ownCropMatches({ name: 'Tomate', apiaCode: 353 }, catalogue)).toEqual([]);
    expect(codes('Porumb', ['porumb'])).toEqual([]);
    expect(codes('Struguri de la bunicul')).toEqual([]);
    expect(codes('  ')).toEqual([]);
  });
});

describe('linking', () => {
  it('keeps the id and the figures, and takes APIA\'s name and code', () => {
    const own: OwnCrop = {
      id: 'own-rapita-1',
      name: 'rapita',
      yieldTPerHa: 3,
      badYieldTPerHa: null,
      priceLeiPerKg: 2,
      costs: { sowingLeiPerHa: 1000, careLeiPerHa: 1200, harvestLeiPerHa: 500 },
      sowingMonth: 9,
      harvestMonth: 7,
    };
    const line = catalogue.find((c) => c.code === 202)!;
    expect(linkOwnCrop(own, line)).toEqual({ ...own, name: line.name_ro, apiaCode: 202 });
  });
});
