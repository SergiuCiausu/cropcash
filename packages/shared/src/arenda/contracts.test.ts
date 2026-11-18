import { describe, expect, it } from 'vitest';
import {
  AddContractInputSchema,
  ContractInputSchema,
  LandownerInputSchema,
  contractRow,
  coverage,
  expiringContracts,
  refuseRenewalBy,
  rentDue,
  type StoredContract,
} from './contracts';

const OWNER = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
const P1 = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e71';
const P2 = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e72';
const base = { landownerId: OWNER, direction: 'taken' as const, areaHa: 2.5, startsOn: '2024-10-01', rentKgPerHa: 800, rentCropId: 'grau' };

const contract = (over: Partial<StoredContract> = {}): StoredContract => ({
  id: 'c1', ...contractRow(ContractInputSchema.parse(base)), archived_at: null, ...over,
});

describe('landowners and contracts, as typed', () => {
  it('takes a landowner with just a name; no CNP field exists', () => {
    expect(LandownerInputSchema.parse({ name: ' Maria Popescu ' })).toEqual({ name: 'Maria Popescu' });
    expect(LandownerInputSchema.safeParse({ name: 'Maria', cnp: '2600101123456' }).success).toBe(false);
    expect(LandownerInputSchema.safeParse({ name: 'Maria', phone: 'nu are' }).success).toBe(false);
  });

  it('needs rent in lei or kg, and kg with a crop', () => {
    expect(ContractInputSchema.safeParse({ ...base, rentKgPerHa: undefined, rentCropId: undefined }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...base, rentCropId: undefined }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...base, rentKgPerHa: undefined, rentCropId: undefined, rentLeiPerHa: 1000 }).success).toBe(true);
    expect(ContractInputSchema.safeParse({ ...base, endsOn: '2024-09-30' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...base, plotIds: [P1, P1] }).success).toBe(false);
    expect(AddContractInputSchema.safeParse({ ...base, clientId: P2 }).success).toBe(true);
  });

  it('keeps area in ari and rent in bani', () => {
    expect(contractRow(ContractInputSchema.parse({ ...base, rentLeiPerHa: 1200 }))).toMatchObject({
      area_ari: 250, rent_bani_per_ha: 120_000, rent_kg_per_ha: 800, rent_crop_id: 'grau', plot_ids: [], ends_on: null,
    });
  });
});

describe('the rent of a year', () => {
  it('kg per ha × ha, and the lei at the county price', () => {
    // 2,5 ha × 800 kg = 2.000 kg wheat; Teleorman 0,69 lei/kg → 1.380 lei.
    expect(rentDue(contract(), 69)).toEqual({ bani: 0, kg: 2000, cropId: 'grau', leiEquivalentBani: 138_000 });
  });

  it('money and kind together; without a price the lei stay unknown', () => {
    const c = contract({ rent_bani_per_ha: 50_000 });
    expect(rentDue(c, null)).toEqual({ bani: 125_000, kg: 2000, cropId: 'grau', leiEquivalentBani: null });
    expect(rentDue(contract({ rent_kg_per_ha: null, rent_crop_id: null, rent_bani_per_ha: 100_000 }), null)).toEqual({ bani: 250_000, kg: 0, cropId: null, leiEquivalentBani: 250_000 });
  });
});

describe('renewal (Codul civil art. 1848)', () => {
  it('a year before the end, half that for a contract of a year or less', () => {
    expect(refuseRenewalBy({ starts_on: '2021-10-01', ends_on: '2026-09-30' })).toBe('2025-09-30');
    expect(refuseRenewalBy({ starts_on: '2025-10-01', ends_on: '2026-09-30' })).toBe('2026-03-30');
    expect(refuseRenewalBy({ starts_on: '2025-10-01', ends_on: null })).toBeNull();
    expect(refuseRenewalBy({ starts_on: '2020-01-01', ends_on: '2027-08-31' })).toBe('2026-08-31');
  });

  it('lists a contract from a month before the refusal day until it ends, the most urgent first', () => {
    const later = contract({ id: 'later', starts_on: '2022-01-01', ends_on: '2027-12-31' }); // refuse by 2026-12-31
    const soon = contract({ id: 'soon', starts_on: '2022-01-01', ends_on: '2027-11-30' }); // refuse by 2026-11-30
    const past = contract({ id: 'past', starts_on: '2020-01-01', ends_on: '2027-03-31' }); // refuse by 2026-03-31
    const far = contract({ id: 'far', starts_on: '2022-01-01', ends_on: '2029-12-31' });
    const ended = contract({ id: 'ended', starts_on: '2020-01-01', ends_on: '2026-10-31' });
    const out = expiringContracts([later, far, ended, soon, past, contract({ id: 'gone', ends_on: '2027-01-31', archived_at: 'x' })], '2026-11-15');
    expect(out.map((e) => [e.contract.id, e.renews])).toEqual([['past', true], ['soon', false]]);
    // 'later' is refused by 31 Dec: it shows from 30 Nov, or now when asked two months ahead.
    expect(expiringContracts([later], '2026-11-30').map((e) => e.contract.id)).toEqual(['later']);
    expect(expiringContracts([later], '2026-11-15', 2).map((e) => e.contract.id)).toEqual(['later']);
    expect(out[1]).toMatchObject({ refuseBy: '2026-11-30', endsOn: '2027-11-30' });
  });
});

describe('coverage: the parcels and the contracts', () => {
  const plots = [
    { id: P1, name: 'La Vale', tenure: 'leased_in' as const, archived_at: null },
    { id: P2, name: 'Deal', tenure: 'leased_in' as const, archived_at: null },
    { id: 'p3', name: 'Acasă', tenure: 'own' as const, archived_at: null },
  ];

  it('finds leased parcels with no contract, contracts with no parcel, and own land in a taken contract', () => {
    const c1 = contract({ id: 'c1', plot_ids: [P1, 'p3'] });
    const c2 = contract({ id: 'c2', landowner_id: 'other', direction: 'given', area_ari: 100, registration_no: '12/2025' });
    const r = coverage(plots, [c1, c2, contract({ id: 'old', plot_ids: [P2], ends_on: '2025-09-30' })], '2026-11-15');
    expect(r.leasedWithoutContract.map((p) => p.name)).toEqual(['Deal']);
    expect(r.contractsWithoutPlot.map((c) => c.id)).toEqual(['c2']);
    expect(r.tenureMismatch.map((m) => [m.plot.name, m.contract.id])).toEqual([['Acasă', 'c1']]);
    expect(r.unregistered.map((c) => c.id)).toEqual(['c1']);
    expect([r.takenAri, r.givenAri]).toEqual([250, 100]);
    expect(r.byLandowner.get(OWNER)).toMatchObject({ takenAri: 250, givenAri: 0 });
    expect(r.byLandowner.get('other')).toMatchObject({ takenAri: 0, givenAri: 100 });
  });
});
