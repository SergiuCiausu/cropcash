import type { ApiaCropRow, ApiaCropTable, Crop } from './schemas';

/*
 * Every crop on the APIA cerere de plată (docs/data/apia-crop-codes.json, MO 193 bis/2026, Tabel 1),
 * named exactly the way APIA names it. Only some have figures (docs/data/crops-reference.json); the rest
 * are in the catalogue so the app can name them, read them off a paper and let the farmer add figures.
 */

/**
 * How APIA tells crops of one kind apart, in its own words. There is no "summer crop": APIA uses
 * autumn/spring for cereals and rapeseed, maturity groups for maize, sorghum, sunflower and soy, early/late
 * for potatoes, annual/perennial for some groups, and a separate list of second crops.
 */
export const APIA_QUALIFIERS = [
  'de toamnă',
  'de primăvară',
  'timpuriu',
  'semi-timpuriu',
  'semi-tardiv',
  'tardiv',
  'timpurii',
  'târzii',
  'anuale',
  'perene',
  'secundare',
] as const;
export type ApiaQualifier = (typeof APIA_QUALIFIERS)[number];

/** The qualifier as it appears in the APIA name (or heading, for the second crops). Null when APIA gives none. */
export function apiaQualifier(row: Pick<ApiaCropRow, 'name' | 'heading'>): ApiaQualifier | null {
  if (row.heading?.includes('CULTURI SECUNDARE')) return 'secundare';
  const n = row.name.toLocaleLowerCase('ro');
  if (n.includes('de toamnă')) return 'de toamnă';
  if (n.includes('de primăvară')) return 'de primăvară';
  if (/semi[- ]timpuriu/.test(n)) return 'semi-timpuriu';
  if (/semi[- ]tardiv/.test(n)) return 'semi-tardiv';
  if (/\btimpuriu\b/.test(n)) return 'timpuriu';
  if (/\btardiv\b/.test(n)) return 'tardiv';
  if (n.includes('timpurii')) return 'timpurii';
  if (n.includes('târzii')) return 'târzii';
  if (/\banuale\b/.test(n)) return 'anuale';
  // "în amestec cu graminee perene" says what it's mixed with, not what the crop is.
  if (/(?<!graminee )\bperene\b/.test(n)) return 'perene';
  return null;
}

/** What a catalogue line is, for grouping and for what the plan can do with it. */
export type CatalogueKind = 'crop' | 'fallow' | 'pasture' | 'perennial' | 'other';

export const FALLOW_APIA_CODE = 970;

function kindOf(row: ApiaCropRow): CatalogueKind {
  if (row.code === FALLOW_APIA_CODE) return 'fallow';
  if (row.section.startsWith('II.')) return 'pasture';
  if (row.section.startsWith('III.')) return row.heading?.includes('AGROFORESTIERE') ? 'other' : 'perennial';
  if (row.section.startsWith('IV.')) return 'other';
  return 'crop';
}

/** Kept as printed: abbreviations, and names that are proper nouns. */
const KEEP_UPPER = new Set(['UAT', 'ADS', 'PP', 'TA', 'CP', 'H.G']);
const PROPER: Record<string, string> = { SUDAN: 'Sudan', TURKESTAN: 'Turkestan' };

/**
 * The APIA name with the same words, in sentence case: "GRÂU COMUN de toamnă" → "Grâu comun de toamnă".
 * Words APIA already wrote in lower case stay as they are.
 */
export function apiaDisplayName(name: string): string {
  const words = name.replace(/\s+/g, ' ').trim().replace(/[\p{L}.]+/gu, (w) => {
    const bare = w.replace(/\.$/, '');
    if (KEEP_UPPER.has(bare)) return w;
    if (PROPER[bare]) return PROPER[bare] + w.slice(bare.length);
    if (/\p{Ll}/u.test(w)) return w;
    return w.toLocaleLowerCase('ro');
  });
  return words.charAt(0).toLocaleUpperCase('ro') + words.slice(1);
}

/** The id of a catalogue line that isn't one of the crops with figures. */
export const apiaCropId = (code: number) => `apia-${code}`;

/** The crop whose figures, INS history and nitrogen limit a crop uses: itself, or its family. */
export const cropFamily = (crop: Pick<Crop, 'id' | 'family'>): string => crop.family ?? crop.id;

/**
 * Each APIA code of a crop with figures becomes its own crop, named as APIA names that line. The first
 * code is the crop itself (keeps its id, so stored farms don't change); the others get `apia-<code>` and
 * the first one as their family, with the same figures.
 */
export function expandCropFamilies(crops: readonly Crop[], table: ApiaCropTable): Crop[] {
  const rows = new Map(table.rows.map((r) => [r.code, r]));
  const row = (code: number, id: string) => {
    const r = rows.get(code);
    if (!r) throw new Error(`APIA code ${code} of ${id} is not in apia-crop-codes.json`);
    return r;
  };
  return crops.flatMap((crop) => {
    const [own, ...rest] = crop.apia_codes ?? [];
    if (own === undefined) return [crop];
    const first = row(own, crop.id);
    const { name_ro_art: _art, aliases: _aliases, yield_basis: _basis, ...shared } = crop;
    return [
      { ...crop, apia_codes: [own], apia_name: first.name, genus: first.genus },
      ...rest.map((code): Crop => {
        const r = row(code, crop.id);
        const name_ro = apiaDisplayName(r.name);
        const art = withArticle(name_ro, crop);
        return { ...shared, id: apiaCropId(code), name_ro, ...(art ? { name_ro_art: art } : {}), apia_name: r.name, apia_codes: [code], genus: r.genus, family: crop.id };
      }),
    ];
  });
}

/**
 * The name for a sentence, from the family's: "Grâu comun de primăvară" with "grâul" → "grâul comun de
 * primăvară", "Porumb-hibrid/soi tardiv" → "porumbul-hibrid/soi tardiv". Undefined when the first word differs.
 */
function withArticle(name: string, family: Pick<Crop, 'name_ro' | 'name_ro_art'>): string | undefined {
  const lead = /^\p{L}+/u;
  const first = name.match(lead)?.[0];
  const familyFirst = family.name_ro.match(lead)?.[0];
  const articled = family.name_ro_art?.match(lead)?.[0];
  if (!first || !articled || first.toLocaleLowerCase('ro') !== familyFirst?.toLocaleLowerCase('ro')) return undefined;
  return articled + name.slice(first.length);
}

/** One line of the APIA table, as the app shows it. `priced` = it has figures and goes straight into the plan. */
export interface CatalogueCrop {
  id: string;
  code: number;
  name_ro: string;
  apia_name: string;
  qualifier: ApiaQualifier | null;
  section: string;
  heading: string | null;
  genus: string | null;
  kind: CatalogueKind;
  priced: boolean;
  aliases: string[];
}

/** The whole APIA table, with the crops that have figures under their own ids. Crops must be expanded first. */
export function buildCatalogue(table: ApiaCropTable, crops: readonly Crop[]): CatalogueCrop[] {
  const byCode = new Map(crops.flatMap((c) => (c.apia_codes ?? []).map((code) => [code, c] as const)));
  return table.rows.map((row) => {
    const crop = byCode.get(row.code);
    return {
      id: crop?.id ?? apiaCropId(row.code),
      code: row.code,
      name_ro: crop?.name_ro ?? apiaDisplayName(row.name),
      apia_name: row.name,
      qualifier: apiaQualifier(row),
      section: row.section,
      heading: row.heading,
      genus: row.genus,
      kind: kindOf(row),
      priced: !!crop,
      aliases: crop?.aliases ?? [],
    };
  });
}

/** Lower case, no diacritics, single spaces: "Rapiţă" (cedilla), "Rapiță" (comma) and "rapita" match. */
export const foldRo = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s\-–/+,()]+/g, ' ')
    .trim();

/**
 * Catalogue lines matching what the farmer typed: the code, or every word somewhere in the name or an
 * alias. Best first: exact code, name starting with the text, then crops with figures, field crops,
 * and APIA's order.
 */
export function searchCatalogue(catalogue: readonly CatalogueCrop[], query: string, limit = 30): CatalogueCrop[] {
  const q = foldRo(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored: { c: CatalogueCrop; score: number; at: number }[] = [];
  catalogue.forEach((c, at) => {
    const texts = [c.name_ro, c.apia_name, ...c.aliases].map(foldRo);
    let score: number;
    if (String(c.code) === q) score = 0;
    else if (texts.some((t) => t.startsWith(q))) score = 1;
    else if (texts.some((t) => words.every((w) => t.split(' ').some((tw) => tw.startsWith(w))))) score = 2;
    else return;
    const rank = score * 100 + (c.priced ? 0 : 10) + (c.kind === 'crop' || c.kind === 'fallow' ? 0 : 5);
    scored.push({ c, score: rank, at });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.at - b.at)
    .slice(0, limit)
    .map((s) => s.c);
}

/**
 * What APIA counts as one crop for diversification (PD-04, GAEC 7): the genus („Genul botanic al culturii”,
 * MO 193 bis/2026, II.B.b). Grâu comun de toamnă and Grâu dur de primăvară are both Triticum, so one crop.
 * A line without a genus (mixtures, "Alte …", fallow land) counts on its own.
 */
export function diversificationKey(crop: Pick<Crop, 'id'> & { genus?: string | null } | undefined, cropId: string): string {
  return crop?.genus ? `genus:${crop.genus}` : cropId;
}

/** The diversification key of any crop id the farm may use: a crop with figures, a catalogue line or an own crop. */
export function diversificationKeyOf(data: {
  crops: { crops: readonly (Pick<Crop, 'id'> & { genus?: string | null })[] };
  catalogue?: readonly Pick<CatalogueCrop, 'id' | 'genus'>[];
}): (cropId: string) => string {
  const genus = new Map<string, string | null | undefined>((data.catalogue ?? []).map((c) => [c.id, c.genus]));
  for (const c of data.crops.crops) if (c.genus !== undefined || !genus.has(c.id)) genus.set(c.id, c.genus);
  return (cropId) => diversificationKey({ id: cropId, genus: genus.get(cropId) }, cropId);
}
