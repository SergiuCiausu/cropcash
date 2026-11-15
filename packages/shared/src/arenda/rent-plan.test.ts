/* Rent in the plan and the tax withheld (docs/employees-arenda-plan.md §3.3–3.4, plan step 8). Teleorman 2026 prices
   (docs/data/arenda-prices-2026.json): wheat 0,69 lei/kg, sunflower 1,84 lei/kg. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { computeSubsidies, normalizeParcels, type FarmInput } from '../subsidies';
import { buildTimeline, type TimelineOptions } from '../cashflow/timeline';
import { landownerYears, payMonthOf, rentPayment, rentPayments, unplannedContracts } from './schedule';
import type { StoredContract } from './contracts';

const data = loadData();
const contract = (over: Partial<StoredContract> = {}): StoredContract => ({
  id: 'c-wheat',
  landowner_id: 'maria',
  direction: 'taken',
  area_ari: 250,
  locality: null,
  plot_ids: [],
  starts_on: '2020-10-01',
  ends_on: '2025-09-30',
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
const cash = contract({ id: 'c-cash', landowner_id: 'vasile', area_ari: 350, rent_bani_per_ha: 120_000, rent_kg_per_ha: null, rent_crop_id: null, pay_month: 10 });

describe('one payment and its tax', () => {
  it('rent in wheat: 2.000 kg, 1.380 lei at the county price, 110,40 lei tax, 1.840 kg to the landowner', () => {
    const p = rentPayment(contract(), '2027-09-15', 'TR', data);
    expect(p).toMatchObject({ grossKg: 2000, priceBaniPerKg: 69, grossValueBani: 138_000, taxBani: 11_040, paidKg: 1840, grossBani: 0, paidBani: 0, taxDueOn: '2027-10-25' });
  });

  it('money rent: 4.200 lei, 336 lei tax, 3.864 lei to the landowner', () => {
    expect(rentPayment(cash, '2027-10-15', 'TR', data)).toMatchObject({ grossBani: 420_000, cashTaxBani: 33_600, paidBani: 386_400, taxBani: 33_600, taxDueOn: '2027-11-25' });
  });

  it('without the county price, no tax and the whole kg', () => {
    expect(rentPayment(contract(), '2027-09-15', 'GR', data)).toMatchObject({ grossKg: 2000, paidKg: 2000, taxBani: null, grossValueBani: null, taxDueOn: null });
  });
});

describe('when a contract pays', () => {
  it('in its pay month; rent in kind with none, at its crop’s harvest; money rent with none, not planned', () => {
    expect(payMonthOf(contract({ pay_month: null }), data)).toEqual({ month: 7, guessed: true });
    expect(payMonthOf(cash, data)).toEqual({ month: 10, guessed: false });
    expect(payMonthOf({ ...cash, pay_month: null }, data)).toBeNull();
    expect(unplannedContracts([contract(), { ...cash, pay_month: null }], data).map((c) => c.id)).toEqual(['c-cash']);
  });

  it('past its end it renews (art. 1848); once marked as ended it stops; not before it starts', () => {
    const at = (c: StoredContract) => rentPayments([c], '2026-11', '2028-10', 'TR', data, 15).map((p) => p.date);
    expect(at(contract())).toEqual(['2027-09-15', '2028-09-15']);
    expect(at(contract({ archived_at: '2028-01-10T08:00:00Z' }))).toEqual(['2027-09-15']);
    expect(at(contract({ starts_on: '2027-10-01' }))).toEqual(['2028-09-15']);
  });

  it('adds up per landowner for the accountant', () => {
    const rows = landownerYears(rentPayments([contract(), cash, contract({ id: 'c2', area_ari: 100 })], '2026-11', '2027-10', 'TR', data, 15));
    const maria = rows.find((r) => r.landownerId === 'maria')!;
    expect(maria.kg).toEqual([{ cropId: 'grau', grossKg: 2800, paidKg: 2576 }]);
    expect(maria.taxBani).toBe(11_040 + 4_416);
    expect(rows.find((r) => r.landownerId === 'vasile')).toMatchObject({ grossBani: 420_000, paidBani: 386_400, taxBani: 33_600 });
  });
});

describe('in the plan', () => {
  const ion: FarmInput = { parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], age: 55 };
  const input = { parcels: normalizeParcels(ion.parcels), subsidies: computeSubsidies(ion, data, { exchangeRates: { FEGA: 5.28 } }), startBalance: 3_500_000 };
  const opts: TimelineOptions = { start: '2026-11', months: 12, amounts: 'medium', timing: 'late' };
  const entries = (t: ReturnType<typeof buildTimeline>) => t.months.flatMap((m) => m.entries);
  const without = entries(buildTimeline(input, data, opts));
  const rent = (contracts: StoredContract[], recorded = []) =>
    entries(buildTimeline({ ...input, recorded, rent: { contracts, county: 'TR', owners: { maria: 'Maria', vasile: 'Vasile' } } }, data, opts));
  const sale = (es: typeof without) => es.find((e) => e.id.startsWith('sale:grau:2027-07'))!.value;

  it('rent in wheat the farm grows lowers the wheat sale by the kg the landowner gets, and the tax goes out on the 25th', () => {
    const es = rent([contract()]);
    // 1.840 kg × 1,05 lei (the plan's wheat price).
    expect(sale(without) - sale(es)).toBe(193_200);
    expect(es.find((e) => e.kind === 'rent_tax')).toMatchObject({ date: '2027-10-25', value: 11_040, direction: 'out', what: 'Maria' });
    expect(es.some((e) => e.kind === 'rent')).toBe(false);
  });

  it('money rent goes out in its month, after the tax kept back', () => {
    expect(rent([cash]).find((e) => e.kind === 'rent')).toMatchObject({ date: '2027-10-15', value: 386_400, what: 'Vasile' });
  });

  it('rent in a crop the farm doesn’t grow is grain to buy', () => {
    const sun = contract({ id: 'c-sun', area_ari: 100, rent_kg_per_ha: 100, rent_crop_id: 'floarea-soarelui' });
    // 100 kg; 1,84 lei → 184 lei, 14,72 lei tax = 8 kg kept; 92 kg × 2,15 lei.
    expect(rent([sun]).find((e) => e.kind === 'rent')).toMatchObject({ id: 'rent-buy:c-sun:2027-09-15', rentKg: 92, value: 19_780, cropId: 'floarea-soarelui' });
    expect(sale(rent([sun]))).toBe(sale(without));
  });

  it('rent received: money after the lessee’s withholding, and grain to sell', () => {
    const es = rent([
      contract({ id: 'g1', direction: 'given', area_ari: 1000, rent_bani_per_ha: 100_000, rent_kg_per_ha: null, rent_crop_id: null, pay_month: 11 }),
      contract({ id: 'g2', direction: 'given', area_ari: 100, pay_month: 12 }),
    ]);
    expect(es.find((e) => e.id === 'rent:g1:2026-11-15')).toMatchObject({ kind: 'rent_in', direction: 'in', value: 920_000 });
    // 800 kg, 44,16 lei tax = 64 kg kept by the lessee; 736 kg × 1,05 lei.
    expect(es.find((e) => e.id === 'rent-kind:g2:2026-12-15')).toMatchObject({ kind: 'rent_in', rentKg: 736, value: 77_280 });
    expect(es.some((e) => e.kind === 'rent_tax')).toBe(false);
  });

  it('a rent expense recorded in the month takes the planned money rent off', () => {
    const recorded = [{ kind: 'expense' as const, amount: 386_400, date: '2027-10-03', replacesPlanned: true, rent: true }];
    expect(rent([cash], recorded as never).some((e) => e.kind === 'rent')).toBe(false);
  });
});
