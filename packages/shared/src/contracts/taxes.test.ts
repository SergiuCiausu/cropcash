/* The taxes to the state a contract brings (docs/contracts-plan.md §4, docs/16-contracts-law.md §6). */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import type { StoredContract } from '../arenda/contracts';
import type { ContractFlow } from './schedule';
import { contractTaxes, flatRateCompensation, landTaxLines, reverseChargeGoods, taxMonths, taxTotals, type ContractTaxInput, type TaxProfile } from './taxes';
import { fromLease, vatPayerOf } from './view';

const data = loadData();
const t = data.contractTaxes;

const flow = (date: string, amountBani: number | null, over: Partial<ContractFlow> = {}): ContractFlow => ({
  contractId: 'c1',
  source: 'contract',
  paymentId: 'p1',
  date,
  direction: 'out',
  amountBani,
  kg: 0,
  cropId: null,
  label: null,
  ...over,
});
const sale = (flows: ContractFlow[], over: Partial<ContractTaxInput> = {}): ContractTaxInput => ({
  id: 'c1',
  kind: 'sale',
  flows: flows.map((f) => ({ ...f, direction: 'in' })),
  vatBp: null,
  cropId: 'grau',
  otherSideVatPayer: true,
  ...over,
});
const profile = (over: Partial<TaxProfile>): TaxProfile => ({ legalForm: 'pfa', vatStatus: 'payer', micro: null, ...over });

describe('the data file', () => {
  it('parses: 21% standard, 11% reduced, reverse charge until the end of 2026, micro 1%', () => {
    expect([t.vat.standard_bp.value, t.vat.reduced_bp.value, t.vat.reverse_charge_grain.applies_until, t.micro_tax.rate_bp.value]).toEqual([2100, 1100, '2026-12-31', 100]);
  });

  it('reverse charge covers cereals, oilseeds and sugar beet; not tobacco (provisional list, #47)', () => {
    const byCode = (code: number) => data.catalogue.find((c) => c.code === code)!.id;
    for (const id of ['grau', 'porumb', 'floarea-soarelui', byCode(202), byCode(203), byCode(301)]) expect(reverseChargeGoods(id, data)).toBe(true);
    expect(reverseChargeGoods(byCode(208), data)).toBe(false);
    expect(reverseChargeGoods(null, data)).toBe(false);
  });
});

describe('a sale', () => {
  it('wheat to a VAT-registered buyer in 2026: reverse charge, no VAT moves (amount 0, said so)', () => {
    const [line] = contractTaxes(sale([flow('2026-08-10', 21_000_000)]), profile({}), data);
    expect(line).toMatchObject({ tax: 'vat', amountBani: 0, dueOn: '2026-09-25', form: '300' });
    expect(line!.note).toMatch(/Taxare inversă/);
  });

  it('the same in 2027, after reverse charge ends: no rate in the contract gives no amount, never 0', () => {
    const [line] = contractTaxes(sale([flow('2027-08-10', 21_000_000)]), profile({}), data);
    expect(line).toMatchObject({ tax: 'vat', amountBani: null, rateBp: null, status: 'DE-VERIFICAT' });
    const [withRate] = contractTaxes(sale([flow('2027-08-10', 21_000_000)], { vatBp: 1100 }), profile({}), data);
    expect(withRate).toMatchObject({ amountBani: 2_310_000, rateBp: 1100, effect: 'owed' });
  });

  it('a buyer whose VAT status we don’t know: no amount, the card asks', () => {
    const [line] = contractTaxes(sale([flow('2026-08-10', 21_000_000)], { otherSideVatPayer: null }), profile({}), data);
    expect(line).toMatchObject({ amountBani: null, status: 'DE-VERIFICAT' });
    expect(line!.note).toMatch(/Cumpărătorul e plătitor/);
  });

  it('VAT is summed per month and due on the 25th of the next', () => {
    const lines = contractTaxes(sale([flow('2027-07-05', 1_000_000), flow('2027-07-25', 1_000_000), flow('2027-08-05', 500_000)], { cropId: null, vatBp: 2100 }), profile({}), data);
    expect(lines.map((l) => [l.dueOn, l.baseBani, l.amountBani])).toEqual([
      ['2027-08-25', 2_000_000, 420_000],
      ['2027-09-25', 500_000, 105_000],
    ]);
  });

  it('delivered in kind with no price: the base is unknown, so is the VAT', () => {
    const [line] = contractTaxes(sale([flow('2027-08-10', null, { kg: 200_000, cropId: 'grau' })], { vatBp: 1100 }), profile({}), data);
    expect(line).toMatchObject({ baseBani: null, amountBani: null });
  });

  it('a farmer in the flat-rate scheme or not registered collects no VAT; the scheme gets 8% from the buyer', () => {
    expect(contractTaxes(sale([flow('2027-08-10', 21_000_000)]), profile({ vatStatus: 'special_agri' }), data)).toEqual([]);
    expect(contractTaxes(sale([flow('2027-08-10', 21_000_000)]), profile({ legalForm: 'pf', vatStatus: 'not_registered' }), data)).toEqual([]);
    expect(flatRateCompensation(21_000_000, t)).toBe(1_680_000);
  });

  it('VAT status not told: a line with no amount that asks for it', () => {
    const [line] = contractTaxes(sale([flow('2027-08-10', 21_000_000)]), profile({ vatStatus: null }), data);
    expect(line).toMatchObject({ amountBani: null });
    expect(line!.note).toMatch(/Datele firmei/);
  });

  it('PF/PFA/II on the norm: no income tax per sale', () => {
    const lines = contractTaxes(sale([flow('2027-08-10', 21_000_000)]), profile({ legalForm: 'ii', vatStatus: 'not_registered' }), data);
    expect(lines.filter((l) => l.tax === 'micro_tax')).toEqual([]);
  });

  it('an SRL on the micro tax: 1% per quarter, due the 25th after the quarter', () => {
    const srl = profile({ legalForm: 'srl', vatStatus: 'not_registered', micro: true });
    const lines = contractTaxes(sale([flow('2027-07-15', 10_000_000), flow('2027-09-30', 5_000_000), flow('2027-10-01', 1_000_000)]), srl, data);
    expect(lines.map((l) => [l.tax, l.dueOn, l.amountBani])).toEqual([
      ['micro_tax', '2027-10-25', 150_000],
      ['micro_tax', '2028-01-25', 10_000],
    ]);
  });

  it('an SRL not asked about micro, or on profit tax, or a farm with no legal form: no amount', () => {
    for (const p of [profile({ legalForm: 'srl', vatStatus: 'not_registered', micro: null }), profile({ legalForm: 'srl', vatStatus: 'not_registered', micro: false }), profile({ legalForm: null, vatStatus: 'not_registered' })]) {
      const [line] = contractTaxes(sale([flow('2027-07-15', 10_000_000)]), p, data);
      expect(line).toMatchObject({ tax: 'micro_tax', amountBani: null, status: 'DE-VERIFICAT' });
    }
  });
});

describe('what the farm pays for', () => {
  const service: ContractTaxInput = { id: 'c1', kind: 'service', flows: [flow('2027-05-10', 1_000_000), flow('2027-06-10', 1_000_000)], vatBp: null, cropId: null, otherSideVatPayer: true };

  it('a service for a VAT payer: 21% by default, got back through the D300', () => {
    const lines = contractTaxes(service, profile({}), data);
    expect(lines.map((l) => [l.effect, l.rateBp, l.amountBani, l.dueOn])).toEqual([
      ['deductible', 2100, 210_000, '2027-06-25'],
      ['deductible', 2100, 210_000, '2027-07-25'],
    ]);
  });

  it('not registered: the VAT is a cost paid with the invoice, no due day of his own', () => {
    const [line] = contractTaxes(service, profile({ vatStatus: 'not_registered' }), data);
    expect(line).toMatchObject({ effect: 'cost', amountBani: 210_000, dueOn: null });
  });

  it('a leasing: VAT on each rate and on the residual value', () => {
    const lines = contractTaxes({ ...service, kind: 'leasing', flows: [flow('2027-01-15', 500_000), flow('2027-01-31', 2_000_000, { paymentId: null, label: 'residual' })] }, profile({}), data);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ baseBani: 2_500_000, amountBani: 525_000, status: 'DE-VERIFICAT' });
  });

  it('supply with no rate on the contract (seeds 11%, the rest 21%): no amount, never 0', () => {
    const [line] = contractTaxes({ ...service, kind: 'supply' }, profile({}), data);
    expect(line).toMatchObject({ rateBp: null, amountBani: null });
    const [seeds] = contractTaxes({ ...service, kind: 'supply', vatBp: 1100 }, profile({}), data);
    expect(seeds!.amountBani).toBe(110_000);
  });

  it('insurance and credit are VAT-exempt, a comodat is free; „other” only with a rate', () => {
    for (const kind of ['insurance', 'credit', 'comodat', 'other'] as const) expect(contractTaxes({ ...service, kind }, profile({}), data)).toEqual([]);
    expect(contractTaxes({ ...service, kind: 'other', vatBp: 2100 }, profile({}), data)).toHaveLength(2);
  });

  it('the other side’s VAT status from its CUI', () => {
    expect(vatPayerOf({ kind: 'company', cui: 'RO12345678' })).toBe(true);
    expect(vatPayerOf({ kind: 'company', cui: '12345678' })).toBe(false);
    expect(vatPayerOf({ kind: 'company', cui: null })).toBe(null);
    expect(vatPayerOf({ kind: 'person', cui: null })).toBe(false);
  });
});

describe('arendă', () => {
  const lease = (over: Partial<StoredContract> = {}): StoredContract => ({
    id: 'l1',
    landowner_id: 'maria',
    direction: 'taken',
    area_ari: 250,
    locality: null,
    plot_ids: [],
    starts_on: '2021-10-01',
    ends_on: '2030-09-30',
    rent_bani_per_ha: 50_000,
    rent_kg_per_ha: null,
    rent_crop_id: null,
    pay_month: 9,
    land_tax_by: null,
    registration_no: null,
    registration_date: null,
    archived_at: null,
    ...over,
  });
  const w = { today: '2026-11-18', from: '2027-01-01', to: '2027-12-31' };

  it('taken: the farm withholds 10% of the net (8% of 1.250 lei) and pays it by the 25th of the next month', () => {
    const v = fromLease(lease(), 'Maria', 'TR', data, w, undefined, profile({}));
    expect(v.taxes).toHaveLength(1);
    expect(v.taxes[0]).toMatchObject({ tax: 'rent_income_tax', effect: 'withheld', baseBani: 100_000, rateBp: 1000, amountBani: 10_000, status: 'confirmed', form: null });
    expect(v.taxes[0]!.dueOn).toBe('2027-10-25');
  });

  it('rent in kind with no county price: no amount', () => {
    const v = fromLease(lease({ rent_bani_per_ha: null, rent_kg_per_ha: 800, rent_crop_id: 'grau' }), 'Maria', null, data, w, undefined, profile({}));
    expect(v.taxes[0]).toMatchObject({ amountBani: null, status: 'DE-VERIFICAT' });
  });

  it('given: the lessee withholds it (shown, not counted); an SRL has none withheld', () => {
    const given = fromLease(lease({ direction: 'given' }), 'Agro SRL', 'TR', data, w, undefined, profile({ legalForm: 'pf' }));
    expect(given.taxes[0]).toMatchObject({ effect: 'other_side', amountBani: 10_000 });
    expect(taxTotals(given.taxes).toStateBani).toBe(0);
    expect(fromLease(lease({ direction: 'given' }), 'Agro SRL', 'TR', data, w, undefined, profile({ legalForm: 'srl' })).taxes).toEqual([]);
  });
});

describe('land tax', () => {
  it('in two halves, 31 March and 30 September; an odd ban goes to the last', () => {
    expect(landTaxLines('l1', 30_001, [2027], t).map((l) => [l.dueOn, l.amountBani, l.to])).toEqual([
      ['2027-03-31', 15_001, 'primarie'],
      ['2027-09-30', 15_000, 'primarie'],
    ]);
  });

  it('50 lei or less: all of it by the first instalment', () => {
    expect(landTaxLines('l1', 4_000, [2027, 2028], t).map((l) => [l.dueOn, l.amountBani])).toEqual([
      ['2027-03-31', 4_000],
      ['2028-03-31', 4_000],
    ]);
  });
});

describe('totals', () => {
  it('to the state: owed + withheld − deductible; costs apart; unknown amounts counted, not added', () => {
    const p = profile({});
    const lines = [
      ...contractTaxes(sale([flow('2027-08-10', 1_000_000)], { cropId: null, vatBp: 2100 }), p, data), // owed 210.000
      ...contractTaxes({ id: 'c2', kind: 'service', flows: [flow('2027-08-10', 100_000)], vatBp: null, cropId: null, otherSideVatPayer: true }, p, data), // deductible 21.000
      ...contractTaxes({ id: 'c3', kind: 'supply', flows: [flow('2027-08-10', 100_000)], vatBp: null, cropId: null, otherSideVatPayer: true }, p, data), // unknown
      ...landTaxLines('l1', 10_000, [2027], t), // owed 5.000 + 5.000
    ];
    expect(taxTotals(lines)).toEqual({ toStateBani: 210_000 - 21_000 + 10_000, withheldBani: 0, deductibleBani: 21_000, costBani: 0, unknown: 1 });
    const months = taxMonths(lines);
    expect(months.map((m) => m.month)).toEqual(['2027-03', '2027-09']);
    expect(months[1]!.totals).toMatchObject({ toStateBani: 210_000 - 21_000 + 5_000, unknown: 1 });
  });
});
