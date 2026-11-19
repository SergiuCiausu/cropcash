/* Contracts across farms (docs/contracts-plan.md §6, step 7): each farm summed with its own data, then added up. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredContract, StoredLandowner } from '../arenda/contracts';
import { contractViews, contractWindow, farmSummary, NO_CONTRACTS, type FarmContracts } from './farm';
import type { StoredContractPayment, StoredFarmContract } from './model';
import { addTaxes, farmContractsSummary, missingFarms, NO_TAXES, sumFarms } from './totals';

const data = loadData();
const today = '2026-11-18';

const owner = (id: string, name: string): StoredLandowner => ({
  id,
  name,
  locality: null,
  phone: null,
  payment: null,
  note: null,
  archived_at: null,
});
const lease = (over: Partial<StoredContract>): StoredContract => ({
  id: 'l1',
  landowner_id: 'maria',
  direction: 'taken',
  area_ari: 250,
  locality: null,
  plot_ids: [],
  starts_on: '2021-10-01',
  ends_on: '2026-09-30',
  rent_bani_per_ha: null,
  rent_kg_per_ha: 800,
  rent_crop_id: 'grau',
  pay_month: 9,
  land_tax_by: null,
  registration_no: null,
  registration_date: null,
  archived_at: null,
  ...over,
});
const insurance = (over: Partial<StoredFarmContract>): StoredFarmContract => ({
  id: 'c1',
  party_id: 'p1',
  kind: 'insurance',
  title: null,
  number: null,
  signed_on: '2026-12-15',
  starts_on: '2027-01-01',
  ends_on: '2027-12-31',
  auto_renews: false,
  notice_days: 20,
  renew_months: null,
  plot_ids: [],
  area_ari: 35_000,
  crop_id: null,
  quantity_kg: null,
  employee_id: null,
  credit_group_id: null,
  vat_bp: null,
  residual_bani: null,
  decision: null,
  decided_on: null,
  archived_at: null,
  ...over,
});
/** 60 lei/ha a year, on 350 ha: 21.000 lei on 15 January. */
const premium = (contractId: string): StoredContractPayment => ({
  id: `pr-${contractId}`,
  contract_id: contractId,
  direction: 'out',
  label: 'Prima',
  first_on: '2027-01-15',
  repeat: 'yearly',
  times: null,
  amount_bani: 6_000,
  per_ha: true,
  kg: null,
  crop_id: null,
});

/** Farm A: Maria's arendă (renewed), an archived one, and a policy for 2027. */
const farmA: FarmContracts = {
  ...NO_CONTRACTS,
  county: 'TR',
  landowners: [owner('maria', 'Maria Ionescu'), owner('gone', 'Vasile'), { ...owner('old', 'Ilie'), archived_at: '2025-01-01T00:00:00Z' }],
  leases: [
    lease({}),
    lease({
      id: 'l2',
      landowner_id: 'gone',
      area_ari: 400,
      archived_at: '2026-01-10T00:00:00Z',
    }),
  ],
  parties: [
    {
      id: 'p1',
      name: 'Groupama',
      kind: 'company',
      cui: 'RO12345678',
      locality: null,
      phone: null,
      note: null,
      archived_at: null,
    } as FarmContracts['parties'][number],
  ],
  contracts: [insurance({})],
  payments: [premium('c1')],
};
/** Farm B: land given in arendă, Maria again (another farm's row), and a policy that ends in January. */
const farmB: FarmContracts = {
  ...NO_CONTRACTS,
  county: 'TR',
  landowners: [owner('maria-b', 'Maria Ionescu')],
  leases: [
    lease({
      id: 'lb',
      landowner_id: 'maria-b',
      direction: 'given',
      area_ari: 100,
    }),
  ],
  parties: farmA.parties,
  contracts: [
    insurance({
      id: 'c2',
      starts_on: '2026-02-01',
      signed_on: '2026-01-20',
      ends_on: '2027-01-31',
    }),
  ],
  payments: [],
};

const A = farmContractsSummary({ farmId: 'a', name: 'Ferma Ana', role: 'owner' }, farmA, data, today);
const B = farmContractsSummary({ farmId: 'b', name: 'Ferma Vida', role: 'manager' }, farmB, data, today);

describe('one farm (farmContractsSummary)', () => {
  it('has the same numbers as its Contracte header', () => {
    const head = farmSummary(contractViews(farmA, data, contractWindow(today, data.params.forecast.plan_months.value)), today);
    expect(A).toMatchObject({
      count: head.count,
      inBani: head.inBani,
      outBani: head.outBani,
      taxes: head.taxes,
    });
    // The 2027 premium: 350 ha × 60 lei.
    expect(A.outBani).toBeGreaterThanOrEqual(2_100_000);
    expect(A.count).toBe(2);
  });

  it('counts only the land in arendă still running, and the landowners not archived', () => {
    expect([A.takenAri, A.givenAri, A.landowners]).toEqual([250, 0, 2]);
    expect([B.takenAri, B.givenAri, B.landowners]).toEqual([0, 100, 1]);
    // The rent the farm pays: A takes land in arendă, B only lets it.
    // Maria's rent is grain, so it stays kilograms: 800 kg/ha on 2,5 ha is 2.000 kg, of which she gets 1.840; the
    // rest is the tax the farm withholds (arenda/schedule.ts, paidKg).
    expect([A.rentOutBani, A.rentOutKg]).toEqual([0, [{ cropId: 'grau', kg: 1_840 }]]);
    expect([B.rentOutBani, B.rentOutKg]).toEqual([0, []]);
  });

  it('puts in „De hotărât” what is due in the next 90 days, tagged with its farm', () => {
    expect(A.due).toEqual([]);
    expect(B.due).toEqual([
      expect.objectContaining({
        farmId: 'b',
        farmName: 'Ferma Vida',
        contractId: 'c2',
        kind: 'insurance',
        party: 'Groupama',
        day: '2027-01-31',
      }),
    ]);
  });

  it('a decided contract is not due', () => {
    const decided = farmContractsSummary(
      { farmId: 'b', name: 'Ferma Vida', role: 'owner' },
      {
        ...farmB,
        contracts: [{ ...farmB.contracts[0]!, decision: 'renew', decided_on: today }],
      },
      data,
      today,
    );
    expect(decided.due).toEqual([]);
  });

  it('a farm with nothing is all zeros', () => {
    const none = farmContractsSummary({ farmId: 'z', name: 'Goală', role: 'accountant' }, NO_CONTRACTS, data, today, false);
    expect(none).toMatchObject({
      arenda: false,
      count: 0,
      inBani: 0,
      outBani: 0,
      taxes: NO_TAXES,
      takenAri: 0,
      givenAri: 0,
      landowners: 0,
      due: [],
      taxMonths: [],
    });
  });
});

describe('across farms (sumFarms)', () => {
  const all = sumFarms([A, B]);

  it('the total is the sum of the farms', () => {
    expect(all.total).toEqual({
      count: A.count + B.count,
      inBani: A.inBani + B.inBani,
      outBani: A.outBani + B.outBani,
      taxes: addTaxes(A.taxes, B.taxes),
      takenAri: 250,
      givenAri: 100,
      rentOutBani: A.rentOutBani + B.rentOutBani,
      rentOutKg: A.rentOutKg,
      // Maria on both farms counts twice (C5).
      landowners: 3,
      due: 1,
    });
    expect(all.farms.map((f) => f.farmId)).toEqual(['a', 'b']);
  });

  it('merges the tax months, each with its farms’ parts adding up to it', () => {
    for (const m of all.taxMonths) expect(m.farms.reduce((t, f) => addTaxes(t, f.totals), NO_TAXES)).toEqual(m.totals);
    const months = all.taxMonths.map((m) => m.month);
    expect(months).toEqual([...months].sort((a, b) => (a ?? '9999').localeCompare(b ?? '9999')));
    const perFarm = [...A.taxMonths, ...B.taxMonths].reduce((t, m) => addTaxes(t, m.totals), NO_TAXES);
    expect(all.taxMonths.reduce((t, m) => addTaxes(t, m.totals), NO_TAXES)).toEqual(perFarm);
  });

  it('merges „De hotărât”, the closest day first', () => {
    const later = {
      ...B.due[0]!,
      farmId: 'a',
      farmName: 'Ferma Ana',
      contractId: 'x',
      day: '2027-02-01',
    };
    const merged = sumFarms([{ ...A, due: [later] }, B]);
    expect(merged.due.map((d) => d.contractId)).toEqual(['c2', 'x']);
  });

  it('no farms: zeros', () => {
    expect(sumFarms([])).toEqual({
      farms: [],
      total: {
        count: 0,
        inBani: 0,
        outBani: 0,
        taxes: NO_TAXES,
        takenAri: 0,
        givenAri: 0,
        rentOutBani: 0,
        rentOutKg: [],
        landowners: 0,
        due: 0,
      },
      due: [],
      taxMonths: [],
    });
  });

  it('names the farms it couldn’t read', () => {
    expect(
      missingFarms(
        [
          { farmId: 'a', name: 'Ferma Ana' },
          { farmId: 'b', name: 'Ferma Vida' },
        ],
        [A],
      ),
    ).toEqual(['Ferma Vida']);
  });
});
