/* A contract read from its paper (docs/contracts-plan.md step 8): every value checked, nothing personal kept. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { AddFarmContractInputSchema } from './model';
import { ContractPaperSchema, normalizeContractPaper, otherSide, paymentDirection, type ContractPaper } from './paper';

const data = loadData();

/** A forward sale of wheat to a trader, as the model would copy it. */
const sale = (over: Partial<ContractPaper> = {}): ContractPaper => ({
  is_contract: true,
  kind: 'sale',
  title: 'Contract de vânzare-cumpărare grâu recolta 2027',
  number: 'VC 112/2027',
  signed_on: '2027-03-01',
  starts_on: '2027-03-01',
  ends_on: '2027-08-31',
  renews_itself: false,
  notice_days: null,
  renew_months: null,
  sides: [
    { role: 'vânzător', name: 'Popescu Ion PFA', cui: '41234567', is_company: true },
    { role: 'cumpărător', name: 'Cereale Câmpia SRL', cui: 'RO 12345678', is_company: true },
  ],
  crop_id: 'grau',
  quantity_tonnes: '200',
  area_ha: null,
  vat_percent: null,
  residual_value: null,
  payments: [
    { label: 'Avans', payer_role: 'cumpărător', first_on: '2027-03-01', repeat: 'none', times: null, amount: '42.000,00 lei', per_ha: false, kg: null, crop_id: null },
    { label: 'La livrare', payer_role: 'Cumpărător', first_on: '2027-07-20', repeat: 'none', times: null, amount: '168.000,50', per_ha: false, kg: null, crop_id: null },
  ],
  ...over,
});

describe('normalizeContractPaper', () => {
  it('a forward sale: the sides with their roles, the dates, the tonnes, the payments in bani', () => {
    const r = normalizeContractPaper(ContractPaperSchema.parse(sale()), data);
    expect(r).toMatchObject({ kind: 'sale', number: 'VC 112/2027', signedOn: '2027-03-01', startsOn: '2027-03-01', endsOn: '2027-08-31', autoRenews: false, cropId: 'grau', quantityKg: 200_000 });
    expect(r.sides).toEqual([
      { role: 'vânzător', name: 'Popescu Ion PFA', cui: '41234567', kind: 'company' },
      { role: 'cumpărător', name: 'Cereale Câmpia SRL', cui: 'RO12345678', kind: 'company' },
    ]);
    // The payer's role is matched whatever its case, and given back as the side spells it.
    expect(r.payments.map((p) => [p.label, p.payerRole, p.firstOn, p.amountBani])).toEqual([
      ['Avans', 'cumpărător', '2027-03-01', 4_200_000],
      ['La livrare', 'cumpărător', '2027-07-20', 16_800_050],
    ]);
  });

  it('which way the money goes depends on the side the farmer says they are', () => {
    const r = normalizeContractPaper(sale(), data);
    expect(paymentDirection(r.payments[0]!, 'vânzător')).toBe('in');
    expect(paymentDirection(r.payments[0]!, 'cumpărător')).toBe('out');
    expect(paymentDirection({ payerRole: null }, 'vânzător')).toBeNull();
    expect(otherSide(r, 'vânzător')?.name).toBe('Cereale Câmpia SRL');
  });

  it('never keeps a CNP or an IBAN, wherever it was copied', () => {
    const r = normalizeContractPaper(
      sale({
        sides: [
          { role: 'vânzător', name: 'Ion Popescu, CNP 1680512340012', cui: null, is_company: false },
          { role: 'cumpărător', name: 'Cereale Câmpia SRL', cui: 'RO12345678', is_company: true },
        ],
        title: 'Cont RO49 AAAA 1B31 0075 9384 0000',
      }),
      data,
    );
    expect(r.sides[0]).toEqual({ role: 'vânzător', name: null, cui: null, kind: 'person' });
    expect(r.title).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/1680512340012|RO49/);
  });

  it('a person has no CUI; what doesn’t parse is null, never guessed', () => {
    const r = normalizeContractPaper(
      sale({
        starts_on: '1 martie 2027',
        ends_on: '2027-02-30',
        quantity_tonnes: 'cca. 200',
        crop_id: 'banane',
        sides: [{ role: 'arendator', name: 'Maria', cui: '12345678', is_company: false }],
        payments: [{ label: null, payer_role: 'nimeni', first_on: '2027-13-01', repeat: null, times: 'x', amount: 'o sută', per_ha: null, kg: null, crop_id: null }],
      }),
      data,
    );
    expect(r).toMatchObject({ startsOn: null, endsOn: null, autoRenews: null, quantityKg: null, cropId: null });
    expect(r.sides[0]!.cui).toBeNull();
    expect(r.payments[0]).toEqual({ label: null, payerRole: null, firstOn: null, repeat: 'none', times: null, amountBani: null, perHa: false, kg: null, cropId: null });
  });

  it('an end before the start is dropped, and renewal only goes with an end', () => {
    const r = normalizeContractPaper(sale({ ends_on: '2026-01-01', renews_itself: true, renew_months: '12' }), data);
    expect([r.endsOn, r.autoRenews, r.renewMonths]).toEqual([null, null, null]);
  });

  it('a leasing: monthly instalments, VAT and the residual value', () => {
    const r = normalizeContractPaper(
      sale({
        kind: 'leasing',
        crop_id: null,
        quantity_tonnes: null,
        ends_on: '2031-03-01',
        notice_days: '30 de zile',
        vat_percent: '21%',
        residual_value: '12.500 lei',
        payments: [{ label: 'Rata', payer_role: 'utilizator', first_on: '2027-04-01', repeat: 'monthly', times: '48', amount: '3.250,00', per_ha: false, kg: null, crop_id: null }],
        sides: [
          { role: 'finanțator', name: 'Agro Leasing IFN SA', cui: 'RO 9876543', is_company: true },
          { role: 'utilizator', name: 'Popescu Ion PFA', cui: null, is_company: true },
        ],
      }),
      data,
    );
    expect(r).toMatchObject({ kind: 'leasing', noticeDays: 30, vatBp: 2100, residualBani: 1_250_000 });
    expect(r.payments[0]).toMatchObject({ repeat: 'monthly', times: 48, amountBani: 325_000, payerRole: 'utilizator' });
  });

  it('not a contract: no kind, so the screen says so', () => {
    expect(normalizeContractPaper(sale({ is_contract: false }), data).kind).toBeNull();
    expect(normalizeContractPaper(sale({ kind: null }), data).kind).toBe('other');
  });

  it('what it reads fits the form: the sale goes through the add schema once the farmer is the seller', () => {
    const r = normalizeContractPaper(sale(), data);
    const input = {
      partyId: '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f',
      kind: r.kind,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      cropId: r.cropId,
      quantityKg: r.quantityKg,
      payments: r.payments.map((p) => ({ direction: paymentDirection(p, 'vânzător'), firstOn: p.firstOn, amountLei: p.amountBani! / 100 })),
    };
    expect(AddFarmContractInputSchema.safeParse(input).success).toBe(true);
  });
});
