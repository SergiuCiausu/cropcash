import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { expectedLossShare, gatheredWithLoss, lossHistory, lossShareFor } from './crop-loss';
import { harvestFigures } from '../cashflow/seasons';
import { farmData } from '../cashflow/farm-plan';
import type { HarvestsInput } from './harvests';

const params = loadData().params.crop_loss;
const at = (window: number, min: number) => ({ window_years: { value: window }, min_years: { value: min } });

type Parcel = HarvestsInput['years'][number]['parcels'][number];
const year = (y: number, ...parcels: Parcel[]): HarvestsInput['years'][number] => ({
  year: y,
  status: 'closed',
  openingBani: 0,
  parcels,
});
const maize = (areaHa: number, lostHa?: number): Parcel => ({ cropId: 'porumb', areaHa, ...(lostHa === undefined ? {} : { lost: { ha: lostHa } }) });

describe('the settings in docs/data', () => {
  it('are there, so nothing about losses is hand-written in code', () => {
    expect(params.window_years.value).toBeGreaterThan(0);
    expect(params.min_years.value).toBeGreaterThan(0);
    expect(params.min_years.value).toBeLessThanOrEqual(params.window_years.value);
  });
});

describe('a crop’s loss history', () => {
  it('lists only the harvests where the farmer said, oldest first', () => {
    const years = [
      year(2026, maize(7, 0)),
      year(2024, { cropId: 'porumb', areaHa: 8, lost: { ha: 3, reason: 'drought' } }),
      year(2025, maize(7)),
      year(2027, { cropId: 'grau', areaHa: 8, lost: { ha: 1 } }),
    ];
    expect(lossHistory(years, 'porumb')).toEqual([
      { year: 2024, sownHa: 8, lostHa: 3, reason: 'drought' },
      { year: 2026, sownHa: 7, lostHa: 0 },
    ]);
  });

  it('is empty for a crop the farm never grew', () => {
    expect(lossHistory([year(2026, maize(7, 1))], 'floarea')).toEqual([]);
  });
});

describe('the usual share lost', () => {
  it('weights each harvest by its hectares', () => {
    // 3 of 8 and 0 of 2: 3 of 10, not the 18,75% an average of 37,5% and 0% would give.
    const years = [year(2025, maize(8, 3)), year(2026, maize(2, 0))];
    expect(expectedLossShare(years, 'porumb', at(5, 2))).toEqual({ share: 0.3, from: 2025, to: 2026, harvests: 2 });
  });

  it('counts a year with nothing lost, but not a year the farmer said nothing about', () => {
    const years = [year(2024, maize(10, 4)), year(2025, maize(10)), year(2026, maize(10, 0))];
    expect(expectedLossShare(years, 'porumb', at(5, 2))).toMatchObject({ share: 0.2, harvests: 2 });
  });

  it('is null below the minimum of answered harvests', () => {
    expect(expectedLossShare([year(2026, maize(10, 10))], 'porumb', at(5, 2))).toBeNull();
    expect(expectedLossShare([year(2025, maize(10)), year(2026, maize(10, 5))], 'porumb', at(5, 2))).toBeNull();
  });

  it('keeps only the latest answered harvests', () => {
    const years = [year(2023, maize(10, 10)), year(2024, maize(10, 2)), year(2025, maize(10, 0)), year(2026, maize(10, 1))];
    expect(expectedLossShare(years, 'porumb', at(3, 2))).toEqual({ share: 0.1, from: 2024, to: 2026, harvests: 3 });
  });

  it('counts a whole field lost', () => {
    const years = [year(2025, maize(5, 5)), year(2026, maize(5, 0))];
    expect(expectedLossShare(years, 'porumb', at(5, 2))!.share).toBe(0.5);
  });

  it('leaves out the harvest it is predicting, and the ones after it', () => {
    const years = [year(2024, maize(10, 1)), year(2025, maize(10, 3)), year(2026, maize(10, 9))];
    expect(expectedLossShare(years, 'porumb', at(5, 2), 2026)).toMatchObject({ share: 0.2, to: 2025 });
    expect(expectedLossShare(years, 'porumb', at(5, 2), 2025)).toBeNull();
  });
});

describe('the share the plan uses for one harvest', () => {
  const history = [year(2025, maize(10, 2)), year(2026, maize(10, 0))];

  it('is 0 with nothing to go on', () => {
    expect(lossShareFor(null, 'porumb', 2027, params)).toEqual({ share: 0, basis: 'none' });
    expect(lossShareFor({ years: [year(2027, maize(10))] }, 'porumb', 2027, at(5, 2))).toEqual({ share: 0, basis: 'none' });
  });

  it('takes the farm’s history', () => {
    expect(lossShareFor({ years: [...history, year(2027, maize(10))] }, 'porumb', 2027, at(5, 2))).toEqual({
      share: 0.1,
      basis: 'history',
      from: 2025,
      to: 2026,
      harvests: 2,
    });
  });

  it('prefers the farmer’s own usual share over the history', () => {
    const expected = [{ cropId: 'porumb', yieldTPerHa: null, priceLeiPerKg: null, lossPct: 15 }];
    expect(lossShareFor({ years: history, expected }, 'porumb', 2027, at(5, 2))).toEqual({ share: 0.15, basis: 'farmer' });
  });

  it('falls back to the history when the farmer’s share is left empty', () => {
    const expected = [{ cropId: 'porumb', yieldTPerHa: 5, priceLeiPerKg: null, lossPct: null }];
    expect(lossShareFor({ years: history, expected }, 'porumb', 2027, at(5, 2)).basis).toBe('history');
  });

  it('takes 0% from the farmer as an answer', () => {
    const expected = [{ cropId: 'porumb', yieldTPerHa: null, priceLeiPerKg: null, lossPct: 0 }];
    expect(lossShareFor({ years: history, expected }, 'porumb', 2027, at(5, 2))).toEqual({ share: 0, basis: 'farmer' });
  });

  it('uses what the farmer already said about that very harvest above everything else', () => {
    const expected = [{ cropId: 'porumb', yieldTPerHa: null, priceLeiPerKg: null, lossPct: 15 }];
    const years = [...history, year(2027, maize(8, 2))];
    expect(lossShareFor({ years, expected }, 'porumb', 2027, at(5, 2))).toEqual({ share: 0.25, basis: 'this_year', year: 2027 });
    // A known 0 this year is an answer too, so neither the 15% nor the history applies.
    expect(lossShareFor({ years: [...history, year(2027, maize(8, 0))], expected }, 'porumb', 2027, at(5, 2)).share).toBe(0);
  });

  it('predicts a later harvest from the history, this year’s loss included', () => {
    const years = [...history, year(2027, maize(10, 4))];
    expect(lossShareFor({ years }, 'porumb', 2028, at(5, 2))).toMatchObject({ basis: 'history', to: 2027 });
    expect(lossShareFor({ years }, 'porumb', 2028, at(5, 2)).share).toBeCloseTo(6 / 30);
  });

  it('keeps each crop to its own history', () => {
    const years = [year(2025, maize(10, 5), { cropId: 'grau', areaHa: 8, lost: { ha: 0 } }), year(2026, maize(10, 5), { cropId: 'grau', areaHa: 8, lost: { ha: 0 } })];
    expect(lossShareFor({ years }, 'grau', 2027, at(5, 2)).share).toBe(0);
    expect(lossShareFor({ years }, 'porumb', 2027, at(5, 2)).share).toBe(0.5);
  });
});

describe('yield per harvested hectare', () => {
  const gathered = (over: { areaHa?: number; tonnes?: number | null; harvested?: string } = {}) => ({
    cropId: 'porumb',
    areaHa: 8,
    tonnes: 20,
    priceLeiPerKg: null,
    storedTonnes: null,
    ...over,
  });

  it('8 ha, 3 lost, 20 t is 4 t/ha, not 2,5', () => {
    expect(harvestFigures([{ cropId: 'porumb', areaHa: 8, lostHa: 3, tonnes: 20, priceLeiPerKg: null }])[0]?.yieldTPerHa).toBe(4);
    expect(harvestFigures([{ cropId: 'porumb', areaHa: 8, tonnes: 20, priceLeiPerKg: null }])[0]?.yieldTPerHa).toBe(2.5);
  });

  it('a crop lost entirely gives no yield, and leaves the other rows alone', () => {
    expect(harvestFigures([{ cropId: 'porumb', areaHa: 8, lostHa: 8, tonnes: 0, priceLeiPerKg: null }])[0]?.yieldTPerHa).toBeNull();
    const [mixed] = harvestFigures([
      { cropId: 'porumb', areaHa: 8, lostHa: 8, tonnes: 0, priceLeiPerKg: null },
      { cropId: 'porumb', areaHa: 5, tonnes: 30, priceLeiPerKg: null },
    ]);
    expect(mixed?.yieldTPerHa).toBe(6);
  });

  it('takes the loss of the harvest the gathering month falls in', () => {
    const harvests = { years: [year(2025, maize(8, 1)), year(2026, maize(8, 3))], gathered: [gathered({ harvested: '2025-10' })] };
    expect(gatheredWithLoss(harvests)[0]?.lostHa).toBe(1);
  });

  it('without a month, takes the latest harvest that has the crop', () => {
    const harvests = { years: [year(2026, maize(8, 3)), year(2025, maize(8, 1))], gathered: [gathered()] };
    expect(gatheredWithLoss(harvests)[0]?.lostHa).toBe(3);
  });

  it('counts nothing lost when the farmer didn\'t say, or said 0', () => {
    expect(gatheredWithLoss({ years: [year(2026, maize(8))], gathered: [gathered()] })[0]).not.toHaveProperty('lostHa');
    expect(gatheredWithLoss({ years: [year(2026, maize(8, 0))], gathered: [gathered()] })[0]).not.toHaveProperty('lostHa');
  });

  it('reaches the plan: the normal year of maize is 4 t/ha', () => {
    const harvests = { years: [year(2026, maize(8, 3))], gathered: [gathered({ harvested: '2026-10' })] };
    const own = farmData({ harvests }, loadData());
    expect(own.crops.crops.find((c) => c.id === 'porumb')?.yield_t_per_ha.mean).toBe(4);
  });
});
