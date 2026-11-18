/* Places from INS's SIRUTA register (docs/harta-plan.md, step 1b): every county, town, commune and village
   by its code, the commune each one belongs to, and a readable line for it („satul Măldăeni, comuna
   Măldăeni”). The register has no coordinates; a village's point comes from OpenStreetMap, matched by
   the SIRUTA code OSM keeps on the village (`siruta:code`). Pure: the import script reads the files. */
import typesFile from '../../../../docs/data/siruta-types.json';
import { plainName } from './lpis';
import type { Position } from './model';

export const PLACE_KINDS = ['county', 'municipality', 'town', 'commune', 'village', 'component_locality', 'sector'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
/** The kinds that are a UAT: a commune, a town or a municipality, which a bloc in LPIS belongs to. */
export const UAT_KINDS: readonly PlaceKind[] = ['municipality', 'town', 'commune'];
/** The kinds a farmer lives in or near: what „lângă satul X” can name. */
export const LOCALITY_KINDS: readonly PlaceKind[] = ['village', 'component_locality'];

export interface SirutaType {
  tip: number;
  ins: string;
  kind: PlaceKind;
  /** The seat of its county, town, municipality or commune. */
  seat: boolean;
}
/** docs/data/siruta-types.json: the TIP codes from INS's legend. */
export const SIRUTA_TYPES = typesFile.types as SirutaType[];

/** One row of the INS CSV, as published. */
export interface SirutaRow {
  siruta: number;
  /** DENLOC, as INS writes it: capitals, sometimes with the old cedilla letters (Ş, Ţ). */
  name: string;
  /** JUD: INS's county number (34 = Teleorman), not the two-letter code. */
  jud: number;
  /** SIRSUP: the unit above (village → commune → county). */
  parent: number;
  tip: number;
  /** MED: 1 urban, 3 rural (0 for a county). */
  urban: boolean;
}

const NEEDED = ['SIRUTA', 'DENLOC', 'JUD', 'SIRSUP', 'TIP', 'MED'] as const;

/** The INS CSV (`;`-separated, UTF-8, maybe with a BOM). Throws when a column this needs is missing. */
export function parseSirutaCsv(text: string): SirutaRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = (lines[0] ?? '').split(';').map((h) => h.trim().toUpperCase());
  const at = Object.fromEntries(NEEDED.map((c) => [c, head.indexOf(c)])) as Record<(typeof NEEDED)[number], number>;
  const missing = NEEDED.filter((c) => at[c] < 0);
  if (missing.length) throw new Error(`SIRUTA file without ${missing.join(', ')}`);
  return lines.slice(1).flatMap((line) => {
    const cells = line.split(';');
    const num = (c: (typeof NEEDED)[number]) => Number(cells[at[c]]?.trim());
    const row: SirutaRow = { siruta: num('SIRUTA'), name: (cells[at.DENLOC] ?? '').trim(), jud: num('JUD'), parent: num('SIRSUP'), tip: num('TIP'), urban: num('MED') === 1 };
    return Number.isInteger(row.siruta) && row.siruta > 0 && row.name && Number.isInteger(row.tip) ? [row] : [];
  });
}

/** Ş ş Ţ ţ (cedilla, as older files write them) → Ș ș Ț ț (comma below, the correct Romanian letters). */
export const fixCedillas = (s: string) => s.replace(/Ş/g, 'Ș').replace(/ş/g, 'ș').replace(/Ţ/g, 'Ț').replace(/ţ/g, 'ț');

/** Words written in small letters inside a place name („Valea lui Mihai”, „Ostrovu de Sus”). */
const SMALL = new Set(['de', 'din', 'cu', 'la', 'lui', 'pe', 'sub', 'peste', 'și', 'în', 'lângă', 'dintre']);
/** The kind is said apart, so the word INS puts before a UAT's name goes. */
const PREFIX = /^(JUDEȚUL|MUNICIPIUL|ORAȘ|ORAȘUL|SECTORUL)\s+/;

/** „MUNICIPIUL ALEXANDRIA” → „Alexandria”, „VALEA LUI MIHAI” → „Valea lui Mihai”. */
export function displayName(insName: string): string {
  const upper = fixCedillas(insName.trim()).replace(PREFIX, '');
  return upper
    .toLocaleLowerCase('ro')
    .split(/(\s+|-)/)
    .map((w, i) => (/^(\s+|-)$/.test(w) || (i > 0 && SMALL.has(w)) ? w : w.charAt(0).toLocaleUpperCase('ro') + w.slice(1)))
    .join('');
}

/** A place, ready for the app: its name, what it is, the commune it belongs to, and its point when known. */
export interface Place {
  siruta: number;
  name: string;
  kind: PlaceKind;
  seat: boolean;
  /** Two-letter county code (TR, CT). */
  county: string;
  /** The unit above, as INS has it; null for a county. */
  parent: number | null;
  /** The commune, town or municipality it belongs to: itself for one of those, null for a county. */
  commune: number | null;
  /** Where the village or town is ([lng, lat]), from OpenStreetMap; absent when unknown. */
  at?: Position;
}

/** A village as OSM has it: its SIRUTA code, its name and its point. */
export interface OsmPlace {
  siruta: number;
  name: string;
  at: Position;
}

export interface BuildPlacesResult {
  places: Place[];
  /** TIP codes not in siruta-types.json: the legend changed, so nothing is guessed. */
  unknownTips: number[];
  /** Villages and town parts with no point in OSM. A town is where its seat locality is. */
  withoutPoint: number[];
}

/**
 * The places of the counties given (`counties`: INS JUD number → two-letter code). A name from OSM is
 * used when it is the same name as INS's, only properly written („Măldăeni” for „MĂLDĂENI”); otherwise
 * INS's name, written in small letters by displayName.
 */
export function buildPlaces(rows: readonly SirutaRow[], counties: Readonly<Record<number, string>>, osm: readonly OsmPlace[] = [], types: readonly SirutaType[] = SIRUTA_TYPES): BuildPlacesResult {
  const typeOf = new Map(types.map((t) => [t.tip, t]));
  const mine = rows.filter((r) => counties[r.jud]);
  const byCode = new Map(mine.map((r) => [r.siruta, r]));
  const points = new Map(osm.map((p) => [p.siruta, p]));
  const unknownTips = [...new Set(mine.filter((r) => !typeOf.has(r.tip)).map((r) => r.tip))].sort((a, b) => a - b);
  const kindOf = (r: SirutaRow) => typeOf.get(r.tip)?.kind ?? null;

  const communeOf = (r: SirutaRow): number | null => {
    let cur: SirutaRow | undefined = r;
    for (let hops = 0; cur && hops < 5; hops++) {
      const k = kindOf(cur);
      if (k && UAT_KINDS.includes(k)) return cur.siruta;
      cur = byCode.get(cur.parent);
    }
    return null;
  };

  const withoutPoint: number[] = [];
  const places = mine.flatMap((r): Place[] => {
    const t = typeOf.get(r.tip);
    if (!t) return [];
    const ins = displayName(r.name);
    const p = points.get(r.siruta);
    const name = p && plainName(fixCedillas(p.name)) === plainName(ins) ? fixCedillas(p.name).trim() : ins;
    if (!p && LOCALITY_KINDS.includes(t.kind)) withoutPoint.push(r.siruta);
    return [
      {
        siruta: r.siruta,
        name,
        kind: t.kind,
        seat: t.seat,
        county: counties[r.jud]!,
        parent: t.kind === 'county' ? null : r.parent,
        commune: communeOf(r),
        ...(p ? { at: p.at } : {}),
      },
    ];
  });
  return { places, unknownTips, withoutPoint };
}

const UNIT_WORD: Partial<Record<PlaceKind, string>> = { commune: 'comuna', town: 'orașul', municipality: 'municipiul', county: 'județul' };

/** „comuna Măldăeni”, „orașul Zimnicea”, „municipiul Alexandria”. */
export function unitName(p: Pick<Place, 'name' | 'kind'>): string {
  const word = UNIT_WORD[p.kind];
  return word ? `${word} ${p.name}` : p.name;
}

/** A village's own words: „satul Măldăeni”, or just the name for a part of a town. */
const localityName = (p: Place) => (p.kind === 'village' ? `satul ${p.name}` : p.name);

/**
 * One readable line for a code: „satul Măldăeni, comuna Măldăeni”, „comuna Măldăeni”, „Mamaia,
 * municipiul Constanța”. `byCode` holds the places of the county.
 */
export function placeLabel(siruta: number, byCode: ReadonlyMap<number, Place>): string | null {
  const p = byCode.get(siruta);
  if (!p) return null;
  if (!LOCALITY_KINDS.includes(p.kind)) return unitName(p);
  const unit = p.commune ? byCode.get(p.commune) : undefined;
  return unit ? `${localityName(p)}, ${unitName(unit)}` : localityName(p);
}

/** The villages and town parts of a commune, town or municipality. */
export const localitiesOf = (commune: number, places: readonly Place[]) => places.filter((p) => p.commune === commune && LOCALITY_KINDS.includes(p.kind));

/** The village nodes of an Overpass answer that carry a SIRUTA code (`siruta:code`, as Romanian OSM tags them). */
export function parseOsmPlaces(answer: unknown): OsmPlace[] {
  const elements = (answer as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) throw new Error('not an Overpass answer');
  return elements.flatMap((e): OsmPlace[] => {
    const el = e as { lon?: unknown; lat?: unknown; center?: { lon?: unknown; lat?: unknown }; tags?: Record<string, unknown> };
    const code = Number(el.tags?.['siruta:code']);
    const name = typeof el.tags?.name === 'string' ? el.tags.name : '';
    const lng = Number(el.lon ?? el.center?.lon);
    const lat = Number(el.lat ?? el.center?.lat);
    if (!Number.isInteger(code) || code <= 0 || !name || !Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [{ siruta: code, name, at: [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6] }];
  });
}

/** docs/data/siruta-tr-ct.json, as the app reads it: compact rows → places by code. */
export function placesFromFile(file: { columns: readonly string[]; places: readonly (readonly unknown[])[] }): Map<number, Place> {
  const at = (name: string) => file.columns.indexOf(name);
  const i = { siruta: at('siruta'), name: at('name'), kind: at('kind'), seat: at('seat'), county: at('county'), parent: at('parent'), commune: at('commune'), lng: at('lng'), lat: at('lat') };
  const out = new Map<number, Place>();
  for (const row of file.places) {
    const lng = row[i.lng] as number | null;
    const lat = row[i.lat] as number | null;
    const p: Place = {
      siruta: row[i.siruta] as number,
      name: row[i.name] as string,
      kind: row[i.kind] as PlaceKind,
      seat: row[i.seat] === 1,
      county: row[i.county] as string,
      parent: (row[i.parent] as number | null) ?? null,
      commune: (row[i.commune] as number | null) ?? null,
      ...(lng != null && lat != null ? { at: [lng, lat] as Position } : {}),
    };
    out.set(p.siruta, p);
  }
  return out;
}
