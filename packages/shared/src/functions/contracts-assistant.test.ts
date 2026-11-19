/* What the assistant can read and propose about contracts (docs/contracts-plan.md step 9). */
import { describe, expect, it } from 'vitest';
import type { CrossFarmSummary } from '../contracts/totals';
import { loadData } from '../data';
import type { StoredFarm } from '../farm';
import { addContract, archiveContract, decideContract, getContractImpact, getContractsAllFarms, getContractTaxes, listContracts, updateContract } from './contracts';
import type { ReadContext } from './define';
import { buildFarmPlan } from './plan';

const data = loadData();
const LEASING = '55555555-5555-4555-8555-555555555555';
const INSURANCE = '66666666-6666-4666-8666-666666666666';
const contract = (over: object) => ({
  title: null,
  number: null,
  signed_on: null,
  ends_on: null,
  auto_renews: false,
  notice_days: null,
  renew_months: null,
  crop_id: null,
  quantity_kg: null,
  area_ari: null,
  vat_bp: null,
  residual_bani: null,
  decision: null,
  decided_on: null,
  archived_at: null,
  plot_ids: [],
  employee_id: null,
  credit_group_id: null,
  ...over,
});
const farm = {
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }],
  parties: [
    { id: 'p1', name: 'Agro Leasing IFN', kind: 'company', cui: 'RO9876543', locality: null, phone: null, note: null, archived_at: null },
    { id: 'p2', name: 'Groupama', kind: 'company', cui: 'RO6291812', locality: null, phone: null, note: null, archived_at: null },
  ],
  contracts: [
    contract({ id: LEASING, party_id: 'p1', kind: 'leasing', title: 'Leasing tractor', starts_on: '2026-03-01', ends_on: '2030-02-28', vat_bp: 2100 }),
    contract({ id: INSURANCE, party_id: 'p2', kind: 'insurance', title: 'Asigurare grâu', starts_on: '2026-01-10', ends_on: '2026-12-31', crop_id: 'grau', area_ari: 800 }),
  ],
  contract_payments: [
    { id: 'x1', contract_id: LEASING, label: 'Rata', direction: 'out', first_on: '2026-04-01', repeat: 'monthly', times: 48, amount_bani: 250_000, per_ha: false, kg: null, crop_id: null },
    { id: 'x2', contract_id: INSURANCE, label: 'Prima', direction: 'out', first_on: '2026-01-10', repeat: 'yearly', times: null, amount_bani: 120_000, per_ha: false, kg: null, crop_id: null },
  ],
} as unknown as StoredFarm;
const today = '2026-11-15';
const ctx = (over: Partial<ReadContext> = {}): ReadContext => ({ farm, plan: buildFarmPlan(farm, data, { month: '2026-11' }), data, today, ...over });

describe('the assistant and the contracts', () => {
  it('lists them, and „ce expiră anul ăsta” keeps those ending by 31 December', () => {
    const all = listContracts.execute({}, ctx()).data!;
    expect(all.contracts.map((c) => c.party)).toEqual(['Groupama', 'Agro Leasing IFN']);
    const leasing = all.contracts.find((c) => c.id === LEASING)!;
    expect(leasing).toMatchObject({ kind: 'leasing', kindName: 'Leasing utilaj', canDecide: ['buy_out', 'return', 'renew', 'renegotiate'] });
    // A rate a month, over the plan's 12 months.
    expect(leasing.outBani).toBe(12 * 250_000);
    expect(listContracts.execute({ endingBy: '2026-12-31' }, ctx()).data!.contracts.map((c) => c.id)).toEqual([INSURANCE]);
    expect(listContracts.execute({ kind: 'leasing' }, ctx()).data!.contracts.map((c) => c.id)).toEqual([LEASING]);
  });

  it('a contract’s years and the salary with and without it; null for one that isn’t there', () => {
    const out = getContractImpact.execute({ contractId: LEASING }, ctx()).data!;
    expect(out.contract.party).toBe('Agro Leasing IFN');
    expect(out.years.length).toBeGreaterThan(0);
    expect(out.salary.withoutBani).toBeGreaterThan(out.salary.withBani);
    expect(getContractImpact.execute({ contractId: '77777777-7777-4777-8777-777777777777' }, ctx()).data).toBeNull();
  });

  it('taxes by month; without the farm’s legal form it says so', () => {
    const out = getContractTaxes.execute({}, ctx()).data!;
    expect(out.profileKnown).toBe(false);
    for (const m of out.months) for (const l of m.lines) expect(l.effect).not.toBe('other_side');
    const one = out.months[0]?.month;
    if (one) expect(getContractTaxes.execute({ month: one }, ctx()).data!.months.map((m) => m.month)).toEqual([one]);
  });

  it('every farm comes only from the API, and is null without it', () => {
    expect(getContractsAllFarms.runs).toBe('api');
    expect(getContractsAllFarms.allFarms).toBe(true);
    expect(getContractsAllFarms.execute({}, ctx()).data).toBeNull();
    const all = { farms: [], total: {}, due: [], taxMonths: [], missing: ['Ferma Deal'] } as unknown as CrossFarmSummary & { missing: string[] };
    expect(getContractsAllFarms.execute({}, ctx({ allFarms: all })).data).toBe(all);
  });

  it('may propose „Am hotărât” and archiving as cards; adding or changing a contract stays on the screen', () => {
    expect([decideContract.access, archiveContract.access]).toEqual(['confirm', 'confirm']);
    expect([addContract.access, updateContract.access]).toEqual(['user', 'user']);
    expect(decideContract.input.safeParse({ id: INSURANCE, source: 'contract', decision: 'renew', decidedOn: today }).success).toBe(true);
    expect(decideContract.input.safeParse({ id: INSURANCE, source: 'contract', decision: 'maybe', decidedOn: today }).success).toBe(false);
  });
});
