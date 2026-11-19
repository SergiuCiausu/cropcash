/* Contracts in the plan (docs/contracts-plan.md §5, step 5). Ion: 8 ha wheat, 7 ha maize; wheat 5 t/ha at 1,05 lei/kg,
   sold in July (crops-reference.json), so the July 2027 wheat sale is 42.000 lei. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels, type FarmInput } from '../subsidies';
import { buildTimeline, type ContractsInput, type TimelineEntry, type TimelineOptions } from '../cashflow/timeline';
import type { PlanFarm } from '../cashflow/farm-plan';
import type { StoredContract } from '../arenda/contracts';
import type { StoredContractPayment, StoredFarmContract } from './model';
import type { TaxProfile } from './taxes';
import { contractImpact, withoutContract } from './impact';

const data = loadData();

const contract = (over: Partial<StoredFarmContract>): StoredFarmContract => ({
  id: 'k1',
  party_id: 'p1',
  kind: 'sale',
  title: null,
  number: null,
  signed_on: null,
  starts_on: '2027-03-01',
  ends_on: '2027-08-31',
  auto_renews: false,
  notice_days: null,
  renew_months: null,
  plot_ids: [],
  area_ari: null,
  crop_id: 'grau',
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
const pay = (over: Partial<StoredContractPayment>): StoredContractPayment => ({
  id: 'r1',
  contract_id: 'k1',
  direction: 'in',
  label: null,
  first_on: '2027-03-01',
  repeat: 'none',
  times: null,
  amount_bani: null,
  per_ha: false,
  kg: null,
  crop_id: null,
  ...over,
});

const leasing = contract({ id: 'lease-1', kind: 'leasing', crop_id: null, starts_on: '2027-01-15', ends_on: '2030-12-15', residual_bani: 2_500_000 });
const rates = pay({ id: 'rate', contract_id: 'lease-1', direction: 'out', first_on: '2027-01-15', repeat: 'monthly', times: 48, amount_bani: 350_000 });

const ion: FarmInput = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
const base = { parcels: normalizeParcels(ion.parcels), subsidies: computeSubsidies(ion, data, { exchangeRates: { FEGA: 5.28 } }), startBalance: 3_500_000 };
const opts: TimelineOptions = { start: '2026-11', months: 12, amounts: 'medium', timing: 'late' };
const entries = (contracts?: ContractsInput, recorded = []) => buildTimeline({ ...base, recorded, contracts }, data, opts).months.flatMap((m) => m.entries);
const plan = (cs: StoredFarmContract[], ps: StoredContractPayment[], profile?: TaxProfile, recorded = []) =>
  entries({ contracts: cs, payments: ps, parties: { p1: { name: 'Cargill', kind: 'company', cui: 'RO12345678' } }, profile }, recorded);
const wheatSale = (es: TimelineEntry[]) => es.find((e) => e.id === 'sale:grau:2027-07-15')!.value;
const without = entries();
const of = (es: TimelineEntry[], kind: string) => es.filter((e) => e.kind === kind);

describe('a sale contract', () => {
  it('its money comes on its days, and its 20 t at its price come off the market sale of that harvest', () => {
    const es = plan(
      [contract({ quantity_kg: 20_000 })],
      [pay({ id: 'adv', amount_bani: 480_000 }), pay({ id: 'del', first_on: '2027-07-20', amount_bani: 1_920_000, kg: 20_000, crop_id: 'grau' })],
    );
    expect(of(es, 'contract_in').map((e) => [e.date, e.value, e.what])).toEqual([
      ['2027-03-01', 480_000, 'Cargill'],
      ['2027-07-20', 1_920_000, 'Cargill'],
    ]);
    expect(wheatSale(without)).toBe(4_200_000);
    // 20.000 kg × 1,05 lei.
    expect(wheatSale(es)).toBe(4_200_000 - 2_100_000);
    // The farm's VAT status isn't known: VAT on the sale has no amount, so it isn't planned.
    expect(of(es, 'contract_tax')).toEqual([]);
  });

  it('a delivery with no price stays in the forecast at the market price', () => {
    const es = plan([contract({ quantity_kg: 20_000 })], [pay({ id: 'del', first_on: '2027-07-20', kg: 20_000, crop_id: 'grau' })]);
    expect(of(es, 'contract_in')).toEqual([]);
    expect(wheatSale(es)).toBe(4_200_000);
  });

  it('tonnes named on the contract, paid in money only: they come from the harvest of its last day', () => {
    const es = plan([contract({ quantity_kg: 20_000 })], [pay({ id: 'all', first_on: '2027-08-10', amount_bani: 2_400_000 })]);
    expect(wheatSale(es)).toBe(2_100_000);
  });

  it('a recorded sale under the contract takes its planned money of that month off', () => {
    const recorded = [{ kind: 'sale' as const, amount: 1_920_000, date: '2027-07-22', replacesPlanned: true, contractId: 'k1', cropId: 'grau' }];
    const es = plan([contract({ quantity_kg: 20_000 })], [pay({ id: 'adv', amount_bani: 480_000 }), pay({ id: 'del', first_on: '2027-07-20', amount_bani: 1_920_000, kg: 20_000, crop_id: 'grau' })], undefined, recorded as never);
    expect(of(es, 'contract_in').map((e) => e.date)).toEqual(['2027-03-01']);
    // Not the market sale: the recorded money was the contract's.
    expect(wheatSale(es)).toBe(2_100_000);
  });
});

describe('a leasing', () => {
  it('ten rates in the plan’s year; VAT not known as recoverable counts as a cost', () => {
    const es = plan([leasing], [rates]);
    expect(of(es, 'contract_out')).toHaveLength(10);
    expect(of(es, 'contract_tax').map((e) => [e.direction, e.value])).toEqual(Array(10).fill(['out', 73_500]));
  });

  it('for a VAT payer: paid with each rate, got back on the 25th of the next month (October’s falls past the plan)', () => {
    const es = plan([leasing], [rates], { legalForm: 'srl', vatStatus: 'payer', micro: true });
    const tax = of(es, 'contract_tax');
    expect(tax.filter((e) => e.direction === 'out')).toHaveLength(10);
    expect(tax.filter((e) => e.direction === 'in').map((e) => e.date)).toEqual(['2027-02-25', '2027-03-25', '2027-04-25', '2027-05-25', '2027-06-25', '2027-07-25', '2027-08-25', '2027-09-25', '2027-10-25']);
  });

  it('a rate recorded under the contract takes that month’s planned rate off', () => {
    const recorded = [{ kind: 'expense' as const, amount: 350_000, date: '2027-03-03', replacesPlanned: true, contractId: 'lease-1' }];
    const es = plan([leasing], [rates], undefined, recorded as never);
    expect(of(es, 'contract_out').map((e) => e.date)).not.toContain('2027-03-15');
    expect(of(es, 'contract_out')).toHaveLength(9);
  });
});

describe('paid in kind, and contracts that stop', () => {
  it('seed paid in 3 t of wheat at harvest lowers the wheat sale before it', () => {
    const supply = contract({ id: 'k2', kind: 'supply', crop_id: null, starts_on: '2026-11-01', ends_on: '2027-09-30' });
    const es = plan([supply], [pay({ id: 'kind', contract_id: 'k2', direction: 'out', first_on: '2027-08-01', kg: 3_000, crop_id: 'grau' })]);
    expect(wheatSale(es)).toBe(4_200_000 - 315_000);
    expect(of(es, 'contract_out')).toEqual([]);
  });

  it('a premium per ha while the policy runs; none after it ends without renewal', () => {
    const premium = (starts: string, ends: string) =>
      plan([contract({ id: 'k3', kind: 'insurance', crop_id: null, area_ari: 1_500, starts_on: starts, ends_on: ends })], [pay({ id: 'pr', contract_id: 'k3', direction: 'out', first_on: starts, repeat: 'yearly', amount_bani: 6_000, per_ha: true })]);
    expect(of(premium('2027-01-10', '2027-12-31'), 'contract_out').map((e) => [e.date, e.value])).toEqual([['2027-01-10', 90_000]]);
    expect(of(premium('2026-01-10', '2026-12-31'), 'contract_out')).toEqual([]);
  });
});

describe('what a contract weighs (§5.2)', () => {
  const farm = (over: Partial<PlanFarm> = {}): PlanFarm => ({
    birth_year: data.subsidies.meta.campaign_year - 55,
    start_balance_bani: 50_000_000,
    county: 'TR',
    parcels: [
      { crop_id: 'grau', area_ari: 6_000, is_arable: true },
      { crop_id: 'porumb', area_ari: 4_000, is_arable: true },
    ],
    parties: [{ id: 'p1', name: 'BT Leasing', kind: 'company', cui: 'RO12345678', locality: null, phone: null, note: null, archived_at: null }],
    contracts: [leasing],
    contract_payments: [rates],
    ...over,
  });

  it('a leasing: its year, its share of the year’s costs, the salary without it, what’s left to pay inside the plan', () => {
    const impact = contractImpact(farm(), data, 'lease-1', { month: '2026-11' })!;
    expect(impact.years).toHaveLength(1);
    expect(impact.years[0]).toMatchObject({ year: 2027, inBani: 0, outBani: 3_500_000, taxBani: 735_000 });
    expect(impact.years[0]!.shareOfOutPct).toBeGreaterThan(0);
    expect(impact.years[0]!.shareOfOutPct).toBeLessThan(100);
    expect(impact.salary.withoutBani).toBeGreaterThan(impact.salary.withBani);
    expect(impact.untilEnd).toEqual({ inBani: 0, outBani: 3_500_000, taxBani: 735_000, through: '2027-10-31', pastPlan: true });
    expect(impact.perHa).toBeNull();
  });

  it('an arendă: what each hectare leaves after the rent and its tax', () => {
    const lease: StoredContract = {
      id: 'arenda-1',
      landowner_id: 'maria',
      direction: 'taken',
      area_ari: 1_000,
      locality: null,
      plot_ids: [],
      starts_on: '2021-10-01',
      ends_on: '2030-09-30',
      rent_bani_per_ha: 100_000,
      rent_kg_per_ha: null,
      rent_crop_id: null,
      pay_month: 10,
      land_tax_by: null,
      registration_no: null,
      registration_date: null,
      archived_at: null,
    };
    const impact = contractImpact(farm({ contracts: [], contract_payments: [], lease_contracts: [lease] }), data, 'arenda-1', { month: '2026-11' })!;
    // 1.000 lei/ha gross: 920 to the landowner in October, 80 withheld (due 25 November, past the plan).
    expect(impact.years[0]).toMatchObject({ year: 2027, outBani: 920_000 });
    expect(impact.perHa!.costBani).toBe(100_000);
    expect(impact.perHa!.leftBani).toBe(impact.perHa!.marginBani - 100_000);
  });

  it('no such contract: null; the what-if farm drops it and its schedule only', () => {
    expect(contractImpact(farm(), data, 'nope', { month: '2026-11' })).toBeNull();
    const w = withoutContract(farm(), 'lease-1');
    expect([w.contracts, w.contract_payments, w.parties?.length]).toEqual([[], [], 1]);
  });
});
