import { describe, expect, it } from 'vitest';
import { loadData } from './index';
import { APIA_QUALIFIERS, apiaDisplayName, apiaQualifier, searchCatalogue } from './catalogue';
import { computeSubsidies } from '../subsidies';
import { buildProfile } from '../subsidies/profile';
import { diversificationKeyOf } from './catalogue';
import { withCountyYields } from '../cashflow/county-yields';
import { withOwnCrops } from '../farm/own-crops';

const data = loadData();
const line = (code: number) => data.catalogue.find((c) => c.code === code)!;
const crop = (id: string) => data.crops.crops.find((c) => c.id === id)!;

describe('APIA Tabel 1 (MO 193 bis/2026)', () => {
  it('has every code once, 365 in all', () => {
    expect(data.apiaTable.rows).toHaveLength(365);
    expect(new Set(data.catalogue.map((c) => c.id)).size).toBe(365);
  });

  it('says autumn, spring, early or late exactly as APIA does', () => {
    expect(line(101)).toMatchObject({ name_ro: 'Grâu comun de toamnă', apia_name: 'GRÂU COMUN de toamnă', qualifier: 'de toamnă' });
    expect(line(1010)).toMatchObject({ name_ro: 'Grâu comun de primăvară', qualifier: 'de primăvară' });
    expect(line(10602)).toMatchObject({ name_ro: 'Orzoaică de bere de primăvară', qualifier: 'de primăvară' });
    expect(line(202)).toMatchObject({ name_ro: 'Rapiţă de toamnă', qualifier: 'de toamnă' });
    expect(line(158).qualifier).toBe('de toamnă');
    expect(line(115)).toMatchObject({ name_ro: 'Porumb-hibrid/soi timpuriu', qualifier: 'timpuriu' });
    expect(line(116).qualifier).toBe('semi-timpuriu');
    expect(line(124).qualifier).toBe('semi-timpuriu');
    expect(line(118).qualifier).toBe('semi-tardiv');
    expect(line(129).qualifier).toBe('tardiv');
    expect(line(251).qualifier).toBe('timpurii');
    expect(line(253).qualifier).toBe('târzii');
    expect(line(351).qualifier).toBe('anuale');
    expect(line(3510).qualifier).toBe('perene');
    expect(line(477).qualifier).toBe('secundare');
  });

  it('adds no qualifier APIA doesn’t write', () => {
    expect(line(108).qualifier).toBeNull();
    expect(line(111).qualifier).toBeNull();
    // Mixed with perennial grasses: the crop itself isn't called perennial.
    expect(line(1515).qualifier).toBeNull();
    expect(data.catalogue.some((c) => /de vară/.test(c.name_ro) && c.code !== 251)).toBe(false);
  });

  it('gives every name with a season or maturity word a qualifier from the closed list', () => {
    const words = /toamn|primăvar|timpuri|tardiv|târzii|anuale|perene/i;
    for (const c of data.catalogue) {
      const mixedOnly = /graminee perene\)?$/i.test(c.apia_name) && !/(anuale|\(perene\)|perene \(|furajere perene|culturi perene)/i.test(c.apia_name);
      if (words.test(c.apia_name) && !mixedOnly) expect(c.qualifier, `${c.code} ${c.apia_name}`).not.toBeNull();
      if (c.qualifier) expect(APIA_QUALIFIERS).toContain(c.qualifier);
    }
  });

  it('keeps the words, only in sentence case', () => {
    expect(apiaDisplayName('FLOAREA SOARELUI HIBRID/SOI SEMI TIMPURIU')).toBe('Floarea soarelui hibrid/soi semi timpuriu');
    expect(apiaDisplayName('SORG X SUDAN ENERGETIC')).toBe('Sorg x Sudan energetic');
    expect(apiaDisplayName('PAJIŞTI PERMANENTE aparținând UAT,ADS sau altor entităţi')).toBe('Pajişti permanente aparținând UAT,ADS sau altor entităţi');
    expect(apiaQualifier({ name: 'X', heading: 'LISTA AMESTECURILOR DE SPECII DE CULTURI SECUNDARE' })).toBe('secundare');
  });
});

describe('crops with figures', () => {
  it('are named as their APIA line', () => {
    for (const c of data.crops.crops) {
      const l = data.catalogue.find((x) => x.code === c.apia_codes?.[0]);
      expect(l, c.id).toBeDefined();
      expect(c.name_ro, c.id).toBe(apiaDisplayName(l!.apia_name));
    }
  });

  it('give each APIA line of a family its own crop with the family’s figures', () => {
    const spring = crop('apia-1010');
    expect(spring).toMatchObject({ name_ro: 'Grâu comun de primăvară', family: 'grau', genus: 'Triticum', apia_codes: [1010] });
    expect(spring.cost_lei_per_ha).toEqual(crop('grau').cost_lei_per_ha);
    expect(spring.name_ro_art).toBe('grâul comun de primăvară');
    expect(crop('apia-117').name_ro_art).toBe('porumbul-hibrid/soi tardiv');
    expect(crop('apia-123').name_ro_art).toBe('floarea soarelui-hibrid/soi timpuriu');
    expect(line(1010).priced).toBe(true);
    expect(line(202).priced).toBe(false);
    expect(data.catalogue.filter((c) => c.priced)).toHaveLength(data.crops.crops.length);
  });

  it('share the family’s INS county history', () => {
    const tr = withCountyYields(data, 'TR');
    const find = (id: string) => tr.crops.crops.find((c) => c.id === id)!;
    expect(find('apia-1020').yield_t_per_ha).toEqual(find('grau').yield_t_per_ha);
    expect(find('apia-117').yield_basis).toEqual(find('porumb').yield_basis);
  });
});

describe('searchCatalogue', () => {
  const ids = (q: string) => searchCatalogue(data.catalogue, q).map((c) => c.code);

  it('finds a crop without diacritics, with either Romanian ş/ș', () => {
    expect(ids('rapita').slice(0, 2)).toEqual([202, 2020]);
    expect(ids('orzoaica de toamna')[0]).toBe(106);
  });

  it('finds a crop by its APIA code first', () => {
    expect(ids('1020')[0]).toBe(1020);
  });

  it('puts crops with figures first, so "grâu" shows the wheats', () => {
    expect(ids('grâu').slice(0, 4)).toEqual([101, 1010, 102, 1020]);
  });

  it('finds nothing for an empty text', () => {
    expect(ids('  ')).toEqual([]);
  });
});

describe('diversification', () => {
  const keyOf = diversificationKeyOf(data);
  const count = (...cropIds: string[]) => buildProfile({ age: 50, parcels: cropIds.map((cropId) => ({ cropId, areaHa: 5 })) }, 0, keyOf).distinct_crops;

  it('counts crops by genus, as the APIA form does', () => {
    expect(count('grau', 'apia-1020')).toBe(1);
    expect(count('grau', 'porumb')).toBe(2);
    expect(count('porumb', 'apia-115', 'floarea-soarelui')).toBe(2);
  });

  it('counts a line without a genus, and fallow land, on its own', () => {
    expect(count('grau', 'teren-necultivat')).toBe(2);
    expect(count('apia-460', 'apia-461')).toBe(2);
  });

  it('is what the subsidy engine uses', () => {
    const one = computeSubsidies({ age: 50, parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'apia-1020', areaHa: 8 }] }, data);
    const two = computeSubsidies({ age: 50, parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 8 }] }, data);
    expect(one.schemes.map((s) => s.code)).not.toEqual(two.schemes.map((s) => s.code));
  });
});

describe('a farmer’s own crop picked from the APIA list', () => {
  const own = (id: string, apiaCode?: number) => ({
    id,
    name: 'x',
    ...(apiaCode ? { apiaCode } : {}),
    yieldTPerHa: 3,
    badYieldTPerHa: null,
    priceLeiPerKg: 2,
    costs: { sowingLeiPerHa: 1000, careLeiPerHa: 1000, harvestLeiPerHa: 500 },
    sowingMonth: 9,
    harvestMonth: 7,
  });

  it('keeps the APIA name and genus, so it counts like APIA counts it', () => {
    const farm = withOwnCrops(data, [own('own-rapita-a', 202), own('own-rapita-b', 2020), own('own-altceva')]);
    expect(farm.crops.crops.find((c) => c.id === 'own-rapita-a')).toMatchObject({ apia_name: 'RAPIŢĂ de toamnă', genus: 'Brassica' });
    const keyOf = diversificationKeyOf(farm);
    const count = (...ids: string[]) => buildProfile({ age: 50, parcels: ids.map((cropId) => ({ cropId, areaHa: 5 })) }, 0, keyOf).distinct_crops;
    expect(count('own-rapita-a', 'own-rapita-b')).toBe(1);
    expect(count('own-rapita-a', 'own-altceva', 'grau')).toBe(3);
  });
});
