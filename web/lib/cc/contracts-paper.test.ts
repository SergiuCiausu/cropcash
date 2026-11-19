/* A contract from its paper (docs/contracts-plan.md step 8): what the form starts with. */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import type { ContractPaperReading } from '../../../packages/shared/src/contracts/paper';
import type { StoredParty } from '../../../packages/shared/src/contracts/model';
import { paperDraft, paperKind } from './contracts';

const data = loadData();
const crops = data.crops.crops.map((c) => c.id);
const reading = (over: Partial<ContractPaperReading> = {}): ContractPaperReading => ({
  kind: 'sale',
  title: 'Vânzare grâu 2027',
  number: '112',
  signedOn: '2027-03-01',
  startsOn: '2027-03-01',
  endsOn: '2027-08-31',
  autoRenews: null,
  noticeDays: null,
  renewMonths: null,
  sides: [
    { role: 'vânzător', name: 'Popescu Ion PFA', cui: null, kind: 'company' },
    { role: 'cumpărător', name: 'Cereale Câmpia SRL', cui: 'RO12345678', kind: 'company' },
  ],
  cropId: 'grau',
  quantityKg: 200_500,
  areaAri: null,
  vatBp: null,
  residualBani: null,
  payments: [{ label: 'Avans', payerRole: 'cumpărător', firstOn: '2027-03-01', repeat: 'none', times: null, amountBani: 4_200_050, perHa: false, kg: null, cropId: null }],
  ...over,
});
const party = (id: string, name: string, cui: string | null) => ({ id, name, cui, kind: 'company', archived_at: null }) as unknown as StoredParty;

describe('paperDraft', () => {
  it('the seller: money comes in, the buyer is a new party, lei rounded with a note', () => {
    const d = paperDraft(reading(), 'vânzător', 'sale', [], crops);
    expect(d).toMatchObject({ direction: 'in', party: { name: 'Cereale Câmpia SRL', kind: 'company', cui: 'RO12345678' }, cropId: 'grau', tonnes: '200,5', startsOn: '2027-03-01' });
    expect(d.pays[0]).toMatchObject({ lei: '42001', firstOn: '2027-03-01' });
    expect(d.pays[0]!.note).toContain('rotunjit');
  });

  it('the buyer: money goes out; a party already kept is found by its CUI, or by its name', () => {
    expect(paperDraft(reading(), 'cumpărător', 'sale', [], crops).direction).toBe('out');
    expect(paperDraft(reading(), 'vânzător', 'sale', [party('p1', 'Altceva', '12345678')], crops).party).toEqual({ id: 'p1' });
    expect(paperDraft(reading(), 'vânzător', 'sale', [party('p2', 'cereale  câmpia srl', null)], crops).party).toEqual({ id: 'p2' });
  });

  it('per hectare: times the area when the paper has it, otherwise left for the farmer', () => {
    const perHa = { label: 'Plata', payerRole: 'cumpărător', firstOn: null, repeat: 'yearly', times: null, amountBani: 100_000, perHa: true, kg: null, cropId: null } as const;
    const withArea = paperDraft(reading({ kind: 'service', areaAri: 1_000, payments: [perHa] }), 'vânzător', 'service', [], crops);
    expect(withArea.pays[0]).toMatchObject({ lei: '10000', firstOn: '' });
    expect(withArea.pays[0]!.note).toMatch(/pe hectar.*Data nu e pe hârtie/);
    expect(paperDraft(reading({ kind: 'service', payments: [perHa] }), 'vânzător', 'service', [], crops).pays[0]!.lei).toBe('');
  });

  it('only what this kind’s form shows; no side chosen, no direction', () => {
    const d = paperDraft(reading({ kind: 'leasing', noticeDays: 30, vatBp: 2100, residualBani: 1_250_000 }), null, 'leasing', [], crops);
    expect(d).toMatchObject({ direction: null, party: null, cropId: null, tonnes: null, notice: '30', vat: '21', residual: '12500' });
  });
});

describe('paperKind', () => {
  it('a kind the screen offers stays; one it doesn’t becomes „Alt contract”', () => {
    expect(paperKind({ kind: 'leasing' }, data)).toBe('leasing');
    const later = Object.entries(data.contractTypes.types).find(([, t]) => !t.first_version)?.[0];
    if (later) expect(paperKind({ kind: later as never }, data)).toBe('other');
  });
});
