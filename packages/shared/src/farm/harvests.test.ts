import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { saveHarvests } from '../functions/registry';
import { HarvestsInputSchema, harvestYear, recordHarvestYear, validateHarvests, type HarvestsInput } from './harvests';

const data = loadData();
const harvests: HarvestsInput = {
  years: [
    {
      year: 2026,
      status: 'closed',
      openingBani: 3_000_000,
      parcels: [{ cropId: 'grau', areaHa: 8, status: 'closed', planned: { inBani: 5_200_000, outBani: 3_700_000 } }],
      planned: { inBani: 5_200_000, outBani: 3_700_000, endBani: -500_000 },
    },
    { year: 2027, status: 'open', openingBani: 3_500_000, parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }] },
  ],
  gathered: [{ cropId: 'grau', areaHa: 8, tonnes: 40, priceLeiPerKg: null, storedTonnes: 12, sown: '2025-10', harvested: '2026-07' }],
};
const parses = (value: unknown) => HarvestsInputSchema.safeParse(value).success;

describe('the harvests document', () => {
  it('holds years, closed crops and gathered grain', () => {
    expect(HarvestsInputSchema.parse(harvests)).toEqual(harvests);
  });

  it('needs at least one year, but gathered grain can be empty', () => {
    expect(parses({ ...harvests, years: [] })).toBe(false);
    expect(parses({ ...harvests, gathered: [] })).toBe(true);
  });

  it('leaves records to the transactions table', () => {
    expect(parses({ ...harvests, years: [{ ...harvests.years[1], records: [] }] })).toBe(false);
  });

  it('keeps money in whole bani', () => {
    expect(parses({ ...harvests, years: [{ ...harvests.years[1], openingBani: 10.5 }] })).toBe(false);
    expect(parses({ ...harvests, years: [{ ...harvests.years[1], openingBani: -1 }] })).toBe(false);
  });

  it('refuses a month that does not exist', () => {
    const parcels = [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-13' }];
    expect(parses({ ...harvests, years: [{ ...harvests.years[1], parcels }] })).toBe(false);
  });

  it('is what save_harvests sends', () => {
    expect(saveHarvests.request(harvests)).toEqual({ method: 'PUT', path: '/api/farmers/me/harvests', body: harvests });
  });
});

describe('checking against the crop list', () => {
  it('accepts a good document', () => {
    expect(validateHarvests(harvests, data)).toEqual([]);
  });

  it('refuses an unknown crop, in a year or in gathered grain', () => {
    const [grain] = harvests.gathered;
    expect(validateHarvests({ ...harvests, gathered: [{ ...grain!, cropId: 'nou' }] }, data)).toEqual(['unknown_crop']);
    const parcels = [{ cropId: 'nou', areaHa: 1 }];
    expect(validateHarvests({ ...harvests, years: [{ ...harvests.years[1]!, parcels }] }, data)).toEqual(['unknown_crop']);
  });

  it('refuses the same crop twice in one year, but not across years', () => {
    const parcels = [{ cropId: 'grau', areaHa: 1 }, { cropId: 'grau', areaHa: 2 }];
    expect(validateHarvests({ ...harvests, years: [{ ...harvests.years[1]!, parcels }] }, data)).toEqual(['duplicate_crop']);
  });

  it('refuses the same year twice', () => {
    expect(validateHarvests({ ...harvests, years: [harvests.years[1]!, harvests.years[1]!] }, data)).toEqual(['duplicate_year']);
  });
});

describe('harvest year', () => {
  it('turns over in November', () => {
    expect(harvestYear('2026-10-31')).toBe(2026);
    expect(harvestYear('2026-11-01')).toBe(2027);
    expect(harvestYear('2026-12-31')).toBe(2027);
    expect(harvestYear('2027-05-01')).toBe(2027);
  });

  it('follows the date unless the farmer chose', () => {
    const occurred_at = '2027-03-10T12:00:00Z';
    expect(recordHarvestYear({ occurred_at })).toBe(2027);
    expect(recordHarvestYear({ occurred_at, harvest_year: null })).toBe(2027);
    expect(recordHarvestYear({ occurred_at, harvest_year: 2026 })).toBe(2026);
  });

  it("files a crop's expense under that crop's next harvest", () => {
    const crops = [{ id: 'grau', harvest_month: 7 }, { id: 'porumb', harvest_month: 10 }];
    const cost = (crop_id: string, occurred_at: string, more = {}) => recordHarvestYear({ kind: 'expense', crop_id, occurred_at, ...more }, crops);
    expect(cost('grau', '2026-10-15T12:00:00Z')).toBe(2027);
    expect(cost('grau', '2027-07-15T12:00:00Z')).toBe(2027);
    expect(cost('grau', '2027-08-15T12:00:00Z')).toBe(2028);
    expect(cost('porumb', '2026-10-15T12:00:00Z')).toBe(2026);
    expect(cost('porumb', '2026-11-15T12:00:00Z')).toBe(2027);
    expect(cost('grau', '2026-10-15T12:00:00Z', { harvest_year: 2026 })).toBe(2026);
    // A sale and a whole-farm cost still go by the date.
    expect(recordHarvestYear({ kind: 'sale', crop_id: 'grau', occurred_at: '2026-10-15T12:00:00Z' }, crops)).toBe(2026);
    expect(recordHarvestYear({ kind: 'expense', crop_id: null, occurred_at: '2026-10-15T12:00:00Z' }, crops)).toBe(2026);
  });
});

describe('the figures the farmer expects', () => {
  const year = { year: 2027, status: 'open' as const, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8 }] };
  const doc = (expected: unknown) => HarvestsInputSchema.safeParse({ years: [year], gathered: [], expected });

  it('keeps a document saved before they existed valid', () => {
    expect(HarvestsInputSchema.safeParse({ years: [year], gathered: [] }).success).toBe(true);
  });

  it('accepts a blank figure and refuses zero or a negative one', () => {
    expect(doc([{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: null }]).success).toBe(true);
    expect(doc([{ cropId: 'grau', yieldTPerHa: 0, priceLeiPerKg: null }]).success).toBe(false);
    expect(doc([{ cropId: 'grau', yieldTPerHa: null, priceLeiPerKg: -1 }]).success).toBe(false);
  });

  it('refuses an unknown crop and a crop twice', () => {
    const row = { cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: 1 };
    const check = (rows: typeof row[]) => validateHarvests({ years: [year], gathered: [], expected: rows }, data);
    expect(check([{ ...row, cropId: 'banane' }])).toContain('unknown_crop');
    expect(check([row, row])).toContain('duplicate_crop');
  });
});
