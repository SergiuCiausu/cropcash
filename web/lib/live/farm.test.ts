import { describe, expect, it } from 'vitest';
import { loadData } from '@cropcash/shared';
import { farmChange, farmEdit, farmForPages, harvestsDocument, harvestsFromServer, onboardingHarvests, type MeFarm } from './farm';
import { HarvestsInputSchema, OnboardingInputSchema, UpdateFarmInputSchema } from '../../../packages/shared/src/farm/index';

const data = loadData();
const ion: MeFarm = {
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  demo_now: null,
  parcels: [
    { crop_id: 'porumb', area_ari: 700 },
    { crop_id: 'grau', area_ari: 800 },
  ],
};

describe('the farm on the pages', () => {
  const farm = farmForPages(ion, data, '2026-11-07');

  it('reads like the static demo did', () => {
    expect(farm).toMatchObject({
      name: 'Ion',
      age: 55,
      county: 'Teleorman',
      region: 'Sud-Muntenia',
      startBalanceBani: 3_500_000,
      summary: '15 ha, grâu și porumb',
    });
    expect(farm.parcels).toEqual([
      { cropId: 'grau', areaHa: 8 },
      { cropId: 'porumb', areaHa: 7 },
    ]);
  });

  it('carries the planting month when there is one', () => {
    const parcels = [{ crop_id: 'grau', area_ari: 800, planted_month: '2026-10' }, { crop_id: 'porumb', area_ari: 700, planted_month: null }];
    expect(farmForPages({ ...ion, parcels }, data, '2026-11-07').parcels).toEqual([
      { cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' },
      { cropId: 'porumb', areaHa: 7 },
    ]);
  });

  it('shows part hectares the Romanian way', () => {
    const small = { ...ion, parcels: [{ crop_id: 'grau', area_ari: 750 }] };
    expect(farmForPages(small, data, '2026-11-07').summary).toBe('7,5 ha, grâu');
  });

  it('lists three crops', () => {
    const parcels = [...ion.parcels, { crop_id: 'floarea-soarelui', area_ari: 100 }];
    const { summary } = farmForPages({ ...ion, parcels }, data, '2026-11-07');
    expect(summary).toMatch(/^16 ha, grâu, porumb și /);
  });

  it('copes with a county or crop it does not know', () => {
    const odd = farmForPages({ ...ion, county: 'XX', parcels: [{ crop_id: 'nou', area_ari: 100 }] }, data, '2026-11-07');
    expect(odd).toMatchObject({ county: 'XX', region: null, summary: '1 ha, nou' });
  });
});

describe('what changed', () => {
  it('ignores the order of parcels', () => {
    expect(farmChange(ion, { ...ion, parcels: [...ion.parcels].reverse() })).toBe('none');
  });

  it('ignores the order of records', () => {
    const row = (id: string) => ({ id, amount_bani: 1, kind: 'sale' as const, occurred_at: '2026-11-01T12:00:00Z' });
    expect(farmChange({ ...ion, transactions: [row('a'), row('b')] }, { ...ion, transactions: [row('b'), row('a')] })).toBe('none');
  });

  it('notices a change made on another device', () => {
    const row = { id: 'a', amount_bani: 1, kind: 'sale' as const, occurred_at: '2026-11-01T12:00:00Z' };
    expect(farmChange(ion, { ...ion, transactions: [row] })).toBe('farm');
    expect(farmChange(ion, { ...ion, task_completions: [{ task_id: 'x:2026' }] })).toBe('farm');
    expect(farmChange(ion, { ...ion, harvests: { years: [], gathered: [] } })).toBe('farm');
    expect(farmChange(ion, { ...ion, apia_decision: { campaignYear: 2026, totalBani: 100 } })).toBe('farm');
    expect(farmChange(ion, { ...ion, salary_bani: 90_000 })).toBe('farm');
    expect(farmChange(ion, { ...ion, stripe_account_id: 'acct_1' })).toBe('farm');
    expect(farmChange(ion, { ...ion, payouts: [{ id: 'p', status: 'paid' }] })).toBe('farm');
  });

  it('treats a missing clock and a null clock alike', () => {
    const { demo_now: _clock, ...noClock } = ion;
    expect(farmChange(ion, noClock)).toBe('none');
  });

  it('separates the demo clock from the farm', () => {
    expect(farmChange(ion, { ...ion, demo_now: '2027-03-01T10:00:00Z' })).toBe('clock');
    expect(farmChange(ion, { ...ion, start_balance_bani: 1 })).toBe('farm');
    expect(farmChange(ion, { ...ion, parcels: [{ crop_id: 'grau', area_ari: 900 }] })).toBe('farm');
  });

  it('counts a first copy as a change', () => {
    expect(farmChange(null, ion)).toBe('farm');
  });
});

describe('Recolte, from the server', () => {
  const row = (id: string, kind: NonNullable<MeFarm['transactions']>[number]['kind'], amount: number, date: string, more = {}) => ({
    id,
    kind,
    amount_bani: amount,
    occurred_at: `${date}T12:00:00Z`,
    ...more,
  });

  it('starts a farm with one open year, from its own parcels and money', () => {
    const state = harvestsFromServer(ion, 2027, data);
    expect(state.selected).toBe('r2027');
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: 'r2027',
      year: 2027,
      status: 'open',
      openingBani: 3_500_000,
      summary: '15 ha, grâu și porumb',
      records: [],
    });
  });

  it('shows the farmer\'s records, and Stripe money they cannot remove', () => {
    const state = harvestsFromServer({
      ...ion,
      transactions: [
        row('s', 'sale', 100, '2026-12-01', { crop_id: 'grau' }),
        row('e', 'expense', -50, '2026-12-02', { category: 'diesel' }),
        row('a', 'apia_advance', 900, '2026-12-03', { source: 'stripe_transfer' }),
        row('c', 'crop_sale', 800, '2026-12-04', { crop_id: 'porumb', source: 'stripe_transfer' }),
        row('p', 'salary', -700, '2026-12-05', { source: 'payout' }),
        row('l', 'credit', 500, '2026-12-06', { source: 'stripe_transfer' }),
      ],
    }, 2027, data);
    expect(state.items[0]!.records).toEqual([
      { id: 's', date: '2026-12-01', kind: 'sale', amountBani: 100, cropId: 'grau' },
      { id: 'e', date: '2026-12-02', kind: 'expense', amountBani: -50, category: 'diesel' },
      { id: 'a', date: '2026-12-03', kind: 'apia_advance', amountBani: 900, fixed: true },
      { id: 'c', date: '2026-12-04', kind: 'sale', amountBani: 800, cropId: 'porumb', fixed: true },
    ]);
  });

  it('files a record under the harvest the farmer chose, or the one its date falls in', () => {
    const years = [{ year: 2026, status: 'closed' as const, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8 }] }];
    const state = harvestsFromServer({
      ...ion,
      harvests: { years, gathered: [] },
      transactions: [
        row('old', 'sale', 100, '2027-03-01', { crop_id: 'grau', harvest_year: 2026 }),
        row('now', 'sale', 100, '2027-03-01', { crop_id: 'grau' }),
        row('lost', 'sale', 100, '2020-03-01', { crop_id: 'grau' }),
      ],
    }, 2027, data);
    const ids = (year: number) => state.items.find((h) => h.year === year)!.records.map((r) => r.id);
    expect(ids(2026)).toEqual(['old']);
    expect(ids(2027)).toEqual(['now', 'lost']);
  });

  it('keeps the year under way on the farm\'s parcels, with its closed crops', () => {
    const years = [{ year: 2027, status: 'open' as const, openingBani: 1, parcels: [{ cropId: 'grau', areaHa: 1, status: 'closed' as const }] }];
    const state = harvestsFromServer({ ...ion, harvests: { years, gathered: [] } }, 2027, data);
    expect(state.items[0]).toMatchObject({ openingBani: 3_500_000 });
    expect(state.items[0]!.parcels).toEqual([
      { cropId: 'grau', areaHa: 8, status: 'closed' },
      { cropId: 'porumb', areaHa: 7 },
    ]);
  });

  it('remembers the view, but not one that no longer exists', () => {
    expect(harvestsFromServer(ion, 2027, data, { selected: 'r1999', crop: 'grau' })).toMatchObject({ selected: 'r2027', crop: 'grau' });
  });
});

describe('saving Recolte', () => {
  const state = () => harvestsFromServer(ion, 2027, data);

  it('sends a document the API accepts, without records', () => {
    const page = state();
    page.items[0]!.records = [{ id: 's', date: '2026-12-01', kind: 'sale', amountBani: 100 }];
    expect(HarvestsInputSchema.safeParse(harvestsDocument(page)).success).toBe(true);
  });

  it('drops what only the page uses from gathered grain, and rows with no land', () => {
    const doc = harvestsDocument({
      ...state(),
      gathered: [
        { id: 'grau', filled: true, cropId: 'grau', areaHa: 8, tonnes: 40, priceLeiPerKg: null, storedTonnes: 2, sown: '2025-10', harvested: '2026-07' },
        { cropId: 'porumb', areaHa: null },
      ] as never,
    });
    expect(HarvestsInputSchema.safeParse(doc).success).toBe(true);
    expect(doc.gathered).toEqual([{ cropId: 'grau', areaHa: 8, tonnes: 40, priceLeiPerKg: null, storedTonnes: 2, sown: '2025-10', harvested: '2026-07' }]);
  });

  it('leaves out the illustrative year, and keeps money whole', () => {
    const page = state();
    const closed = { ...page.items[0]!, year: 2026, status: 'closed' as const, planned: { inBani: 10.4, outBani: 5.6, endBani: -1.2 } };
    const doc = harvestsDocument({ ...page, items: [{ ...closed, illustrative: true, year: 2025 }, closed, page.items[0]!] });
    expect(doc.years.map((y) => y.year)).toEqual([2026, 2027]);
    expect(doc.years[0]!.planned).toEqual({ inBani: 10, outBani: 6, endBani: -1 });
  });

  it('survives a trip to the server unchanged', () => {
    const first = harvestsDocument(state());
    const again = harvestsDocument(harvestsFromServer({ ...ion, harvests: first }, 2027, data));
    expect(again).toEqual(first);
  });
});

describe('the figures the farmer expects', () => {
  const expected = [{ cropId: 'grau', yieldTPerHa: 6, priceLeiPerKg: 1.2 }];
  const first = harvestsDocument({ ...harvestsFromServer(ion, 2027, data), expected });

  it('survives a save from Recolte, which rewrites the whole document', () => {
    expect(HarvestsInputSchema.safeParse(first).success).toBe(true);
    const page = harvestsFromServer({ ...ion, harvests: first }, 2027, data);
    expect(harvestsDocument(page).expected).toEqual(expected);
  });

  it('survives finishing onboarding again', () => {
    const doc = onboardingHarvests({ year: 2027, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8 }], gathered: [], before: first });
    expect(doc.expected).toEqual(expected);
  });

  it('keeps the farm\'s own crops through a Recolte save and onboarding', () => {
    const ownCrops = [{ id: 'own-orz-1', name: 'Orz', yieldTPerHa: 5, badYieldTPerHa: null, priceLeiPerKg: 0.9, costs: { sowingLeiPerHa: 1, careLeiPerHa: 0, harvestLeiPerHa: 0 }, sowingMonth: 10, harvestMonth: 7 }];
    const doc = harvestsDocument({ ...harvestsFromServer(ion, 2027, data), ownCrops });
    expect(harvestsDocument(harvestsFromServer({ ...ion, harvests: doc }, 2027, data)).ownCrops).toEqual(ownCrops);
    expect(onboardingHarvests({ year: 2027, openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 8 }], gathered: [], before: doc }).ownCrops).toEqual(ownCrops);
  });

  it('is left out when there is none, so older documents stay as they were', () => {
    expect(harvestsDocument(harvestsFromServer(ion, 2027, data))).not.toHaveProperty('expected');
  });

  it('counts as a change to the farm, so the saved copy refreshes', () => {
    expect(farmChange({ ...ion, harvests: { ...first, expected: [] } }, { ...ion, harvests: first })).toBe('farm');
  });
});

describe('a change to the year under way', () => {
  const harvest = () => harvestsFromServer(ion, 2027, data).items[0]!;

  it('needs no farm edit when nothing changed', () => {
    expect(farmEdit(ion, harvest(), data)).toBeNull();
  });

  it('edits the farm when hectares, crops or money change', () => {
    const more = harvest();
    more.parcels[0] = { ...more.parcels[0]!, areaHa: 9 };
    expect(farmEdit(ion, more, data)?.parcels).toEqual([{ cropId: 'grau', areaHa: 9 }, { cropId: 'porumb', areaHa: 7 }]);
    expect(farmEdit(ion, { ...harvest(), openingBani: 100_000 }, data)?.startBalanceLei).toBe(1000);
    expect(farmEdit(ion, { ...harvest(), parcels: [harvest().parcels[0]!] }, data)?.parcels).toHaveLength(1);
  });

  it('sends a new planting month, and keeps one it was not told to change', () => {
    const dated = { ...ion, parcels: ion.parcels.map((p) => ({ ...p, planted_month: '2026-10' })) };
    expect(farmEdit(dated, harvestsFromServer(dated, 2027, data).items[0]!, data)).toBeNull();
    const moved = harvestsFromServer(dated, 2027, data).items[0]!;
    moved.parcels[0] = { ...moved.parcels[0]!, plantedMonth: '2026-09', areaHa: 8 };
    expect(farmEdit(dated, moved, data)?.parcels[0]).toEqual({ cropId: 'grau', areaHa: 8, plantedMonth: '2026-09' });
    const { plantedMonth: _month, ...noMonth } = moved.parcels[1]!;
    expect(farmEdit(dated, { ...moved, parcels: [moved.parcels[0]!, noMonth] }, data)?.parcels[1]).toEqual({ cropId: 'porumb', areaHa: 7, plantedMonth: '2026-10' });
  });

  it('is an edit the API accepts, and keeps the birth year', () => {
    const edit = farmEdit(ion, { ...harvest(), openingBani: 100_000 }, data)!;
    expect(UpdateFarmInputSchema.safeParse(edit).success).toBe(true);
    expect(data.subsidies.meta.campaign_year - edit.age).toBe(ion.birth_year);
  });
});

describe('finishing onboarding', () => {
  const parcels = [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }];

  it('saves one open year and the gathered grain', () => {
    const doc = onboardingHarvests({
      year: 2027,
      openingBani: 3_500_000,
      parcels,
      gathered: [{ id: 'grau', filled: true, cropId: 'grau', areaHa: 8, tonnes: 40, priceLeiPerKg: 1.2, storedTonnes: null } as never],
    });
    expect(HarvestsInputSchema.safeParse(doc).success).toBe(true);
    expect(doc.years).toEqual([{ year: 2027, status: 'open', openingBani: 3_500_000, parcels }]);
    expect(doc.gathered).toHaveLength(1);
  });

  it('keeps other years when a farm redoes it', () => {
    const before = { years: [{ year: 2026, status: 'closed' as const, openingBani: 0, parcels }], gathered: [] };
    const doc = onboardingHarvests({ year: 2027, openingBani: 0, parcels, gathered: [], before });
    expect(doc.years.map((y) => y.year)).toEqual([2026, 2027]);
  });

  it('accepts a planting month on the farm itself', () => {
    expect(OnboardingInputSchema.parse({ name: 'Ion', county: 'TR', age: 55, parcels }).parcels[0]).toMatchObject({ plantedMonth: '2026-10' });
  });
});
