/* The contract model and the contract-types file (docs/contracts-plan.md §2, docs/16-contracts-law.md). */
import { describe, expect, it } from 'vitest';
import contractTypesJson from '../../../../docs/data/contract-types.json';
import { loadData } from '../data';
import {
  AddFarmContractInputSchema,
  contractPaymentRow,
  decisionsFor,
  FarmContractInputSchema,
  farmContractRow,
  PartyInputSchema,
  PaymentInputSchema,
} from './model';
import { ContractTypesSchema, offeredKinds } from './types';

const data = loadData();
const PARTY = '11111111-1111-4111-8111-111111111111';
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.path.join('.')));

describe('contract-types.json', () => {
  it('parses, and offers the C1 kinds (arendă included) in the file’s order', () => {
    expect(offeredKinds(data.contractTypes)).toEqual(['arenda', 'sale', 'supply', 'service', 'leasing', 'insurance', 'other']);
  });

  it('a kind the app offers must say how it ends', () => {
    const broken = JSON.parse(JSON.stringify(contractTypesJson)) as { types: Record<string, Record<string, unknown>> };
    delete broken.types.insurance!.act_by;
    expect(ContractTypesSchema.safeParse(broken).success).toBe(false);
    // A later kind may stay blank.
    expect(data.contractTypes.types.employment.first_version).toBe(false);
  });

  it('the defaults come from the law read in step 1', () => {
    const t = data.contractTypes.types;
    expect(t.arenda.auto_renews?.value).toBe(true); // Codul civil art. 1848
    expect(t.service.auto_renews?.value).toBe(false); // art. 1810 is for leases only
    expect(t.insurance.notice_days?.value).toBe(20); // art. 2209
    expect(t.service.notice_days?.value).toBeNull(); // art. 1277: „reasonable”, no number
  });
});

describe('the other side', () => {
  it('a company’s CUI is cleaned up; a person has none', () => {
    expect(PartyInputSchema.parse({ name: 'Agricover', kind: 'company', cui: 'ro 123 456' }).cui).toBe('RO123456');
    expect(PartyInputSchema.safeParse({ name: 'Agricover', kind: 'company', cui: 'RO12A' }).success).toBe(false);
    expect(issues(PartyInputSchema.safeParse({ name: 'Vasile Popa', kind: 'person', cui: '123456' }))).toEqual(['cui']);
  });
});

describe('a payment row', () => {
  it('needs lei or kg; kg go with a crop; times need a repeat; per ha needs lei', () => {
    expect(issues(PaymentInputSchema.safeParse({ direction: 'out', firstOn: '2027-01-01' }))).toContain('amountLei');
    expect(issues(PaymentInputSchema.safeParse({ direction: 'out', firstOn: '2027-01-01', kg: 500 }))).toEqual(['cropId']);
    expect(issues(PaymentInputSchema.safeParse({ direction: 'out', firstOn: '2027-01-01', amountLei: 10, times: 3 }))).toEqual(['times']);
    expect(PaymentInputSchema.safeParse({ direction: 'out', firstOn: '2027-01-01', amountLei: 10.555 }).success).toBe(false);
  });

  it('lei become whole bani', () => {
    const p = PaymentInputSchema.parse({ direction: 'out', firstOn: '2027-01-31', repeat: 'monthly', times: 48, amountLei: 1234.56 });
    expect(contractPaymentRow(p)).toEqual({ direction: 'out', label: null, first_on: '2027-01-31', repeat: 'monthly', times: 48, amount_bani: 123_456, per_ha: false, kg: null, crop_id: null });
  });
});

describe('a contract', () => {
  const base = { partyId: PARTY, startsOn: '2027-01-01' };

  it('a sale names its crop; only a leasing has a residual value; a comodat is free', () => {
    expect(issues(FarmContractInputSchema.safeParse({ ...base, kind: 'sale' }))).toEqual(['cropId']);
    expect(issues(FarmContractInputSchema.safeParse({ ...base, kind: 'service', residualLei: 1000 }))).toEqual(['residualLei']);
    const free = { ...base, kind: 'comodat', payments: [{ direction: 'out', firstOn: '2027-02-01', amountLei: 100 }] };
    expect(issues(FarmContractInputSchema.safeParse(free))).toEqual(['payments']);
  });

  it('renews only with an end; ends after it starts', () => {
    expect(issues(FarmContractInputSchema.safeParse({ ...base, kind: 'service', autoRenews: true }))).toEqual(['autoRenews']);
    expect(issues(FarmContractInputSchema.safeParse({ ...base, kind: 'service', endsOn: '2026-12-31' }))).toEqual(['endsOn']);
  });

  it('an advance may be paid at signing, before the start, but not before signing', () => {
    const sale = { ...base, kind: 'sale', cropId: 'grau', quantityKg: 200_000, signedOn: '2026-11-10', endsOn: '2027-08-31' };
    const advance = (firstOn: string) => ({ ...sale, payments: [{ direction: 'in', label: 'Avans', firstOn, amountLei: 42_000 }] });
    expect(FarmContractInputSchema.safeParse(advance('2026-11-10')).success).toBe(true);
    expect(issues(FarmContractInputSchema.safeParse(advance('2026-11-01')))).toEqual(['payments.0.firstOn']);
    expect(issues(FarmContractInputSchema.safeParse(advance('2027-09-01')))).toEqual(['payments.0.firstOn']);
  });

  it('a per-ha payment needs the hectares', () => {
    const service = { ...base, kind: 'service', endsOn: '2027-12-31', payments: [{ direction: 'out', firstOn: '2027-07-10', amountLei: 350, perHa: true }] };
    expect(issues(FarmContractInputSchema.safeParse(service))).toEqual(['payments.0.perHa']);
    expect(FarmContractInputSchema.safeParse({ ...service, areaHa: 120.5 }).success).toBe(true);
  });

  it('the row fills what the farmer left out from the kind’s defaults', () => {
    const insurance = AddFarmContractInputSchema.parse({ ...base, kind: 'insurance', endsOn: '2027-12-31' });
    expect(farmContractRow(insurance, data.contractTypes)).toMatchObject({ auto_renews: false, notice_days: 20, area_ari: null, residual_bani: null });
    const leasing = FarmContractInputSchema.parse({ ...base, kind: 'leasing', endsOn: '2030-12-31', noticeDays: 30, residualLei: 15_000.5, areaHa: 2.5 });
    expect(farmContractRow(leasing, data.contractTypes)).toMatchObject({ notice_days: 30, residual_bani: 1_500_050, area_ari: 250 });
    // The farmer's own choice wins; without an end nothing renews.
    const service = FarmContractInputSchema.parse({ ...base, kind: 'service', endsOn: '2027-12-31', autoRenews: true });
    expect(farmContractRow(service, data.contractTypes).auto_renews).toBe(true);
    expect(farmContractRow(FarmContractInputSchema.parse({ ...base, kind: 'service' }), data.contractTypes).auto_renews).toBe(false);
  });

  it('buying out or giving back only on a leasing; no end decision on a sale', () => {
    expect(decisionsFor('leasing')).toContain('buy_out');
    expect(decisionsFor('insurance')).not.toContain('buy_out');
    expect(decisionsFor('sale')).toEqual([]);
  });
});
