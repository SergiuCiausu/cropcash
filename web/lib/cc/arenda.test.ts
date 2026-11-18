/* The list for the accountant (docs/employees-arenda-plan.md §3.4, step 8). */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import type { StoredContract, StoredLandowner } from '../../../packages/shared/src/arenda/index';
import { accountantCsv, yearRent } from './arenda';

const data = loadData();
const owner = (id: string, name: string, locality: string | null): StoredLandowner => ({ id, name, locality, phone: null, payment: null, note: null, archived_at: null });
const contract = (over: Partial<StoredContract>): StoredContract => ({
  id: 'c1',
  landowner_id: 'm',
  direction: 'taken',
  area_ari: 250,
  locality: null,
  plot_ids: [],
  starts_on: '2020-10-01',
  ends_on: null,
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
const name = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? id;

describe('accountantCsv', () => {
  it('one line per landowner, sorted by name, the CNP column empty', () => {
    const csv = accountantCsv(
      [contract({}), contract({ id: 'c2', landowner_id: 'a', area_ari: 350, rent_kg_per_ha: null, rent_crop_id: null, rent_bani_per_ha: 120_000, pay_month: 10 }), contract({ id: 'g', direction: 'given' })],
      [owner('m', 'Popescu Maria', 'Peretu'), owner('a', 'Ene; Vasile', null)],
      2026,
      'TR',
      data,
      name,
      15,
    );
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]!.split(';')[2]).toBe('CNP');
    expect(lines[1]).toBe('"Ene; Vasile";;;4200,00;;4200,00;336,00;3864,00;');
    expect(lines[2]).toBe('Popescu Maria;Peretu;;0,00;2000 kg grâu comun de toamnă;1380,00;110,40;0,00;1840 kg grâu comun de toamnă');
  });

  it('leaves the tax empty without the county price', () => {
    const csv = accountantCsv([contract({})], [owner('m', 'Maria', null)], 2026, 'GR', data, name, 15);
    expect(csv.trim().split('\r\n')[1]).toBe('Maria;;;0,00;2000 kg grâu comun de toamnă;;;0,00;2000 kg grâu comun de toamnă');
  });
});

describe('yearRent', () => {
  it('reads the county price from the app’s data', () => {
    expect(yearRent([contract({})], 'taken', 'TR', data, '2026-11-15')).toMatchObject({ leiEquivalentBani: 138_000, taxBani: 11_040 });
  });
});
