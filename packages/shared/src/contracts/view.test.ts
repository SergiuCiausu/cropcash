/* One view over arendă and the other contracts (docs/contracts-plan.md §2.3). Teleorman 2026: wheat 0,69 lei/kg. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredContract } from '../arenda/contracts';
import type { StoredContractPayment, StoredFarmContract } from './model';
import { fromContract, fromLease } from './view';

const data = loadData();
const groupama = { name: 'Groupama', kind: 'company' as const, cui: 'RO12345678' };
const cargill = { name: 'Cargill', kind: 'company' as const, cui: 'RO87654321' };

const lease = (over: Partial<StoredContract> = {}): StoredContract => ({
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

const insurance: StoredFarmContract = {
  id: 'c1',
  party_id: 'p1',
  kind: 'insurance',
  title: 'Asigurarea culturilor 2027',
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
};
const premium: StoredContractPayment = {
  id: 'pr',
  contract_id: 'c1',
  direction: 'out',
  label: 'Prima',
  first_on: '2027-01-15',
  repeat: 'yearly',
  times: null,
  amount_bani: 6_000,
  per_ha: true,
  kg: null,
  crop_id: null,
};

describe('an arendă as a contract', () => {
  const w = { today: '2026-11-18', from: '2026-11-01', to: '2028-10-31' };

  it('renewed past its end (art. 1848): the landowner’s wheat after the tax, each September', () => {
    const v = fromLease(lease(), 'Maria Ionescu', 'TR', data, w);
    expect(v).toMatchObject({ source: 'arenda', kind: 'arenda', party: 'Maria Ionescu', endsOn: '2026-09-30', cropId: 'grau' });
    expect(v.end).toMatchObject({ endsOn: '2031-09-30', status: 'renewed' });
    // 2.000 kg gross, 1.840 kg after the tax (docs/15-arenda.md §3).
    expect(v.flows.map((f) => [f.date, f.direction, f.kg, f.amountBani])).toEqual([
      ['2027-09-15', 'out', 1840, 0],
      ['2028-09-15', 'out', 1840, 0],
    ]);
  });

  it('refused before the refusal day: it stops at its end, so no rent after it', () => {
    const v = fromLease(lease({ starts_on: '2022-10-01', ends_on: '2027-09-30' }), 'Maria', 'TR', data, w, { decision: 'end', decidedOn: '2026-09-01' });
    expect(v.end.status).toBe('ending');
    expect(v.flows.map((f) => f.date)).toEqual(['2027-09-15']);
  });

  it('given in arendă: the rent comes in', () => {
    expect(fromLease(lease({ direction: 'given' }), 'Ion', 'TR', data, w).flows[0]).toMatchObject({ direction: 'in', kg: 1840 });
  });
});

describe('another contract', () => {
  it('insurance per ha over 350 ha: the yearly premium while the policy runs, none after (no renewal)', () => {
    const v = fromContract(insurance, [premium], groupama, data, { today: '2027-11-20', from: '2027-01-01', to: '2029-12-31' });
    expect(v).toMatchObject({ source: 'contract', kind: 'insurance', title: 'Asigurarea culturilor 2027', areaAri: 35_000 });
    expect(v.flows.map((f) => [f.date, f.amountBani])).toEqual([['2027-01-15', 2_100_000]]);
    expect(v.end).toMatchObject({ actBy: '2027-12-31', status: 'decide_soon', withoutDecision: 'uninsured' });
  });

  it('renewed: the premium goes on with the policy', () => {
    const renewed = { ...insurance, decision: 'renew' as const, decided_on: '2027-12-01' };
    const v = fromContract(renewed, [premium], groupama, data, { today: '2027-12-05', from: '2027-01-01', to: '2029-12-31' });
    expect(v.flows.map((f) => f.date)).toEqual(['2027-01-15', '2028-01-15']);
    expect(v.end.status).toBe('running');
  });

  it('a sale’s deadlines are its delivery days', () => {
    const sale: StoredFarmContract = { ...insurance, id: 's1', kind: 'sale', notice_days: null, crop_id: 'grau', quantity_kg: 200_000, ends_on: '2027-08-31' };
    const deliveries: StoredContractPayment[] = ['2027-07-15', '2027-08-10'].map((d, i) => ({ ...premium, id: `d${i}`, contract_id: 's1', direction: 'in', repeat: 'none', per_ha: false, first_on: d, amount_bani: 8_400_000, kg: 100_000, crop_id: 'grau' }));
    const v = fromContract(sale, deliveries, cargill, data, { today: '2027-07-20', from: '2027-01-01', to: '2027-12-31' });
    expect(v.end.actBy).toBe('2027-08-10');
    expect(v.flows).toHaveLength(2);
  });
});
