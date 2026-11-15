import { describe, expect, it } from 'vitest';
import trCt from '../../../../docs/data/siruta-tr-ct.json';
import { buildPlaces, displayName, fixCedillas, parseOsmPlaces, parseSirutaCsv, placeLabel, placesFromFile, SIRUTA_TYPES, unitName } from './siruta';

/* A few real rows of INS's SIRUTA s1 2026 (Teleorman), as published. */
const CSV = `﻿SIRUTA;DENLOC;CODP;JUD;SIRSUP;TIP;NIV;MED;REGIUNE;FSJ;NUTS;LAU\r
341;JUDEŢUL TELEORMAN;0;34;1;40;1;0;3;36;RO317;\r
151184;MUNICIPIUL ALEXANDRIA;0;34;341;1;2;1;3;36;RO317;RO_151184\r
151193;ALEXANDRIA;140001;34;151184;9;3;1;3;36;RO317;\r
153277;MĂLDĂENI;0;34;341;3;2;3;3;36;RO317;RO_153277\r
153286;MĂLDĂENI;147195;34;153277;22;3;3;3;36;RO317;\r
999001;VALEA LUI MIHAI;0;34;999000;23;3;3;3;36;RO317;\r
999000;CIOCÂRLIA DE SUS;0;34;341;3;2;3;3;36;RO317;\r
136;JUDEŢUL CONSTANŢA;0;13;1;40;1;0;2;14;RO223;\r
`;

describe('SIRUTA', () => {
  it('reads INS’s CSV: BOM, CRLF, the columns by name', () => {
    const rows = parseSirutaCsv(CSV);
    expect(rows).toHaveLength(8);
    expect(rows[3]).toEqual({ siruta: 153277, name: 'MĂLDĂENI', jud: 34, parent: 341, tip: 3, urban: false });
    expect(rows[1]!.urban).toBe(true);
    expect(() => parseSirutaCsv('SIRUTA;DENLOC\n1;X')).toThrow(/JUD, SIRSUP, TIP, MED/);
  });

  it('every TIP in the legend has a kind, as INS groups them', () => {
    const kind = (tip: number) => SIRUTA_TYPES.find((t) => t.tip === tip)?.kind;
    expect([40, 1, 4, 2, 5, 3, 22, 23, 11, 19, 9, 10, 17, 18, 6].map(kind)).toEqual([
      'county', 'municipality', 'municipality', 'town', 'town', 'commune', 'village', 'village', 'village', 'village',
      'component_locality', 'component_locality', 'component_locality', 'component_locality', 'sector',
    ]);
    expect(SIRUTA_TYPES.filter((t) => t.seat).map((t) => t.tip)).toEqual([1, 5, 9, 17, 22]);
  });

  it('writes the names properly: comma letters, small linking words, no „MUNICIPIUL”', () => {
    expect(fixCedillas('JUDEŢUL CONSTANŢA, MICEŞTI')).toBe('JUDEȚUL CONSTANȚA, MICEȘTI');
    expect(displayName('MUNICIPIUL ALEXANDRIA')).toBe('Alexandria');
    expect(displayName('VALEA LUI MIHAI')).toBe('Valea lui Mihai');
    expect(displayName('CIOCÂRLIA DE SUS')).toBe('Ciocârlia de Sus');
    expect(displayName('PLOPII-SLĂVITEŞTI')).toBe('Plopii-Slăvitești');
    expect(displayName('JUDEŢUL TELEORMAN')).toBe('Teleorman');
  });

  it('follows each village up to its commune, and takes OSM’s spelling only for the same name', () => {
    const osm = [
      { siruta: 153286, name: 'Măldăeni', at: [24.922209, 44.119418] as [number, number] },
      { siruta: 999001, name: 'Alt nume', at: [25, 44] as [number, number] },
    ];
    const { places, unknownTips, withoutPoint } = buildPlaces(parseSirutaCsv(CSV), { 34: 'TR' }, osm);
    const by = new Map(places.map((p) => [p.siruta, p]));
    expect(unknownTips).toEqual([]);
    expect(places.some((p) => p.county !== 'TR')).toBe(false);
    expect(by.get(153286)).toEqual({ siruta: 153286, name: 'Măldăeni', kind: 'village', seat: true, county: 'TR', parent: 153277, commune: 153277, at: [24.922209, 44.119418] });
    expect(by.get(153277)!.commune).toBe(153277);
    expect(by.get(151193)!.commune).toBe(151184);
    expect(by.get(341)!.commune).toBeNull();
    // OSM's name differs, so INS's stays; the point is still OSM's.
    expect(by.get(999001)).toMatchObject({ name: 'Valea lui Mihai', at: [25, 44] });
    expect(withoutPoint).toEqual([151193]);
  });

  it('a TIP missing from the legend is reported, never guessed', () => {
    const { unknownTips, places } = buildPlaces(parseSirutaCsv(CSV.replace(';23;3;3;3', ';77;3;3;3')), { 34: 'TR' });
    expect(unknownTips).toEqual([77]);
    expect(places.some((p) => p.siruta === 999001)).toBe(false);
  });

  it('reads the villages OSM tags with siruta:code', () => {
    const places = parseOsmPlaces({
      elements: [
        { type: 'node', lat: 44.1194184, lon: 24.9222091, tags: { name: 'Măldăeni', place: 'village', 'siruta:code': '153286' } },
        { type: 'node', lat: 44, lon: 25, tags: { name: 'Fără cod', place: 'hamlet' } },
      ],
    });
    expect(places).toEqual([{ siruta: 153286, name: 'Măldăeni', at: [24.922209, 44.119418] }]);
    expect(() => parseOsmPlaces({ error: 'busy' })).toThrow();
  });
});

describe('docs/data/siruta-tr-ct.json', () => {
  const by = placesFromFile(trCt);

  it('holds both counties, from the 2026 release', () => {
    expect(trCt.meta.source_version).toBe('SIRUTA s1 2026');
    expect(trCt.meta.counts).toEqual({ TR: 334, CT: 285 });
    expect(by.size).toBe(619);
  });

  it('says where Ion’s blocs are: satul Măldăeni, comuna Măldăeni', () => {
    expect(placeLabel(153286, by)).toBe('satul Măldăeni, comuna Măldăeni');
    expect(placeLabel(153277, by)).toBe('comuna Măldăeni');
    expect(by.get(153286)!.at).toEqual([24.922209, 44.119418]);
    expect(unitName(by.get(341)!)).toBe('județul Teleorman');
    expect(placeLabel(1, by)).toBeNull();
  });

  it('every village and town part belongs to a commune, town or municipality of its county', () => {
    for (const p of by.values()) {
      if (p.kind === 'county') continue;
      const unit = by.get(p.commune!);
      expect(unit, String(p.siruta)).toBeTruthy();
      expect(['commune', 'town', 'municipality']).toContain(unit!.kind);
      expect(unit!.county).toBe(p.county);
    }
  });
});
