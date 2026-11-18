import { z } from 'zod';
import type { AppData } from '../data';
import { EXPENSE_CATEGORIES } from '../farm';
import type { Bani } from '../money';
import type { IsoDate } from '../cashflow/dates';
import { readPaperPlots, type PaperPlot } from '../plots/reading';

/**
 * Reading a paper the farmer uploads. The AI copies what's printed and code does the rest, so it
 * never does a sum. Nothing here saves anything: the page fills in fields and the farmer confirms.
 */
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILES = 20;

export const ReadDocumentInputSchema = z.strictObject({
  files: z
    .array(z.strictObject({ mediaType: z.enum(DOCUMENT_TYPES), data: z.string().min(1) }))
    .min(1)
    .max(MAX_FILES),
});
export type ReadDocumentInput = z.infer<typeof ReadDocumentInputSchema>;
export type DocumentFile = ReadDocumentInput['files'][number];

export const DOCUMENT_KINDS = ['apia_cerere', 'apia_decizie', 'invoice', 'sale_paper', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * What the AI returns. Amounts and areas stay text exactly as printed, so no float ever carries
 * money. Only a cerere de plată has an applicant, and only what onboarding asks: the name, the CNP
 * (turned into an age here and never sent back), and the county. No IBAN, address or phone.
 */
export const DocumentExtractionSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  year: z.string().nullable(),
  crops: z.array(
    z.object({
      code: z.string().nullable(),
      crop_id: z.string().nullable(),
      name: z.string(),
      area: z.string(),
      /* Where the parcel is, for the map (II.A of a cerere; docs/harta-plan.md step 2). Optional so a
         reading without them still parses. */
      judet: z.string().nullable().optional(),
      localitate: z.string().nullable().optional(),
      siruta: z.string().nullable().optional(),
      bloc_fizic: z.string().nullable().optional(),
      parcel_no: z.string().nullable().optional(),
      farmer_code: z.string().nullable().optional(),
      land_use: z.string().nullable().optional(),
    }),
  ),
  amount: z.string().nullable(),
  date: z.string().nullable(),
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
  crop_id: z.string().nullable(),
  applicant: z
    .object({
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      cnp: z.string().nullable(),
      county_farm: z.string().nullable(),
      county_home: z.string().nullable(),
    })
    .nullable(),
  total_area: z.string().nullable(),
  /* The invoice or receipt number, for the accountant (migration 027). Optional so older readings parse. */
  doc_no: z.string().nullable().optional(),
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

/** Who the cerere is for, as onboarding takes it. There's deliberately no CNP here. */
export interface PaperApplicant {
  firstName: string | null;
  fullName: string | null;
  age: number | null;
  county: string | null;
}

/** What the pages receive: known crops, whole bani, whole ari. Unknown or unclear means null. */
export interface DocumentReading {
  kind: DocumentKind;
  year: number | null;
  parcels: { cropId: string; areaAri: number }[];
  unknownCrops: string[];
  amountBani: Bani | null;
  date: string | null;
  category: (typeof EXPENSE_CATEGORIES)[number] | null;
  cropId: string | null;
  /** Only for a cerere. */
  applicant: PaperApplicant | null;
  /** The total area printed on a cerere, to check the rows against. */
  totalAri: number | null;
  /** Only for a cerere: each II.A row as a parcel, for the map (plots/reading.ts). */
  plots?: PaperPlot[];
  /** On an invoice or a sale paper: its number, as printed (migration 027). */
  docNo?: string;
}

/** An invoice number as the form takes it: trimmed, at most 60 characters, or nothing. */
const docNoOf = (text: string | null | undefined) => text?.replace(/\s+/g, ' ').trim().slice(0, 60) || null;

/** "12.345,67 lei" -> 1234567. Three digits after the last separator make it a thousands mark. */
export function parseLeiText(text: string | null | undefined): Bani | null {
  const digits = text?.replace(/lei|ron/gi, '').replace(/\s/g, '') ?? '';
  if (!/^\d[\d.,]*$/.test(digits)) return null;
  const last = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  const after = last < 0 ? '' : digits.slice(last + 1);
  const hasDecimals = last >= 0 && after.length >= 1 && after.length <= 2;
  const whole = (hasDecimals ? digits.slice(0, last) : digits).replace(/[.,]/g, '');
  const bani = Number(whole) * 100 + (hasDecimals ? Number(after.padEnd(2, '0')) : 0);
  return Number.isSafeInteger(bani) && bani > 0 ? bani : null;
}

/** "8,50" -> 850 ari. Any separator is the decimal mark, because no farm here reaches 1.000 ha. */
export function parseAreaText(text: string | null | undefined): number | null {
  const area = text?.replace(/ha/gi, '').replace(/\s/g, '') ?? '';
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(area);
  if (!match) return null;
  const decimals = (match[2] ?? '').padEnd(3, '0');
  const ari = Number(match[1]) * 100 + Number(decimals.slice(0, 2)) + (Number(decimals[2]) >= 5 ? 1 : 0);
  return ari > 0 ? ari : null;
}

function realDate(text: string | null): string | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return z.iso.date().safeParse(text).success ? text : null;
}

const isApia = (kind: DocumentKind) => kind === 'apia_cerere' || kind === 'apia_decizie';

const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
const MIN_AGE = 16;
const MAX_AGE = 100;

/** Whole years from a birth date to a day, both YYYY-MM-DD. */
function yearsBetween(birth: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  return today.slice(5) < birth.slice(5) ? years - 1 : years;
}

/**
 * The age on `today` from a Romanian CNP (S YY MM DD JJ NNN C). Null when the control digit or the
 * date is wrong, or the age is not one a farmer can have: then the farmer types it.
 */
export function ageFromCnp(text: string | null | undefined, today: IsoDate): number | null {
  const cnp = text?.replace(/\s/g, '') ?? '';
  if (!/^[1-9]\d{12}$/.test(cnp)) return null;
  const digit = (i: number) => Number(cnp.charAt(i));
  const sum = CNP_WEIGHTS.reduce((s, w, i) => s + w * digit(i), 0);
  if ((sum % 11 === 10 ? 1 : sum % 11) !== digit(12)) return null;
  const yy = Number(cnp.slice(1, 3));
  const mmdd = `${cnp.slice(3, 5)}-${cnp.slice(5, 7)}`;
  const born = (century: number) => `${century + yy}-${mmdd}`;
  const sex = digit(0);
  let birth: string;
  if (sex <= 2) birth = born(1900);
  else if (sex <= 4) birth = born(1800);
  else if (sex <= 6) birth = born(2000);
  /* 7, 8, 9: residents and foreigners, whose CNP doesn't say the century. The later one if it's old enough. */
  else birth = yearsBetween(born(2000), today) >= MIN_AGE ? born(2000) : born(1900);
  if (!z.iso.date().safeParse(birth).success) return null;
  const age = yearsBetween(birth, today);
  return age >= MIN_AGE && age <= MAX_AGE ? age : null;
}

/** Lower case, no diacritics (ș/ş, ț/ţ alike), words split by single spaces. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** "JUD. TELEORMAN", "Bistrita Nasaud", "Mun. București, Sector 3" -> a code from counties.json, or null. */
export function countyFromText(text: string | null | undefined, data: AppData): string | null {
  if (!text?.trim()) return null;
  const counties = data.counties.counties;
  const byCode = counties.find((c) => c.code === text.trim().toUpperCase());
  if (byCode) return byCode.code;
  const words = plain(text)
    .replace(/^(judetul|judet|jud)\s+/, '')
    .replace(/^(municipiul|mun)\s+/, '');
  if (/^(bucuresti|sector [1-6])\b/.test(words)) return counties.find((c) => plain(c.name_ro) === 'bucuresti')?.code ?? null;
  return counties.find((c) => plain(c.name_ro) === words)?.code ?? null;
}

/** "ANA-MARIA" -> "Ana-Maria". A name already in mixed case stays as written. */
function nameText(text: string | null | undefined): string | null {
  const name = text?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '';
  if (!name) return null;
  if (name !== name.toLocaleUpperCase('ro')) return name;
  return name.toLocaleLowerCase('ro').replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('ro'));
}

function applicantOf(raw: DocumentExtraction, data: AppData, today: IsoDate): PaperApplicant | null {
  const a = raw.applicant;
  if (!a) return null;
  const firstName = nameText(a.first_name);
  const lastName = nameText(a.last_name);
  const full = [firstName, lastName].filter(Boolean).join(' ').slice(0, 80);
  return {
    firstName,
    fullName: full || null,
    age: ageFromCnp(a.cnp, today),
    county: countyFromText(a.county_farm, data) ?? countyFromText(a.county_home, data),
  };
}

/**
 * Turns the AI's text into checked values. A cerere repeats crops across parcels, so they add up here.
 * A row with an APIA crop code is matched by the code only (docs/data/crops-reference.json), so sweet
 * corn never counts as maize. A row without a code falls back to the AI's crop id.
 * `today` is the day the age is counted on.
 */
export function normalizeReading(raw: DocumentExtraction, data: AppData, today: IsoDate): DocumentReading {
  const known = new Set(data.crops.crops.map((c) => c.id));
  const byCode = new Map(data.crops.crops.flatMap((c) => (c.apia_codes ?? []).map((code) => [code, c.id] as const)));
  const lines = new Map((data.catalogue ?? []).map((c) => [c.code, c]));
  const ari = new Map<string, number>();
  const unknown = new Set<string>();
  if (isApia(raw.kind)) {
    for (const row of raw.crops) {
      const area = parseAreaText(row.area);
      if (!area) continue;
      const code = row.code?.trim() ?? '';
      const cropId = /^\d+$/.test(code) ? byCode.get(Number(code)) : row.crop_id && known.has(row.crop_id) ? row.crop_id : undefined;
      if (cropId) ari.set(cropId, (ari.get(cropId) ?? 0) + area);
      // A code APIA has but we have no figures for is named the way APIA names it, with the code.
      else {
        const line = /^\d+$/.test(code) ? lines.get(Number(code)) : undefined;
        unknown.add(line ? `${line.name_ro} (cod ${line.code})` : row.name.trim().slice(0, 80));
      }
    }
  }
  const paper = raw.kind === 'invoice' || raw.kind === 'sale_paper';
  const year = /^\d{4}$/.test(raw.year ?? '') ? Number(raw.year) : null;
  return {
    kind: raw.kind,
    year: isApia(raw.kind) ? year : null,
    parcels: [...ari].map(([cropId, areaAri]) => ({ cropId, areaAri })),
    unknownCrops: [...unknown].filter(Boolean),
    amountBani: raw.kind === 'apia_cerere' || raw.kind === 'other' ? null : parseLeiText(raw.amount),
    date: paper ? realDate(raw.date) : null,
    category: raw.kind === 'invoice' ? raw.category : null,
    cropId: raw.kind === 'sale_paper' && raw.crop_id && known.has(raw.crop_id) ? raw.crop_id : null,
    applicant: raw.kind === 'apia_cerere' ? applicantOf(raw, data, today) : null,
    totalAri: raw.kind === 'apia_cerere' ? parseAreaText(raw.total_area) : null,
    ...(raw.kind === 'apia_cerere' ? { plots: readPaperPlots(raw.crops, data) } : {}),
    ...(paper && docNoOf(raw.doc_no) ? { docNo: docNoOf(raw.doc_no)! } : {}),
  };
}

/** What a cerere did to the hectares already typed in, so the farmer sees every change. */
export interface PaperMerge {
  /** Crop id -> ari, after the paper. */
  next: Record<string, number>;
  added: { cropId: string; areaAri: number }[];
  changed: { cropId: string; fromAri: number; toAri: number }[];
  /** Crops typed in that the paper doesn't list. They stay as they were. */
  kept: string[];
}

/**
 * The paper wins on the crops it lists: a missing one is added and a different value is replaced.
 * A crop it doesn't list is kept, because the farmer may know something the paper doesn't.
 */
export function mergePaperHa(current: Record<string, number>, paper: { cropId: string; areaAri: number }[]): PaperMerge {
  const next = { ...current };
  const added: PaperMerge['added'] = [];
  const changed: PaperMerge['changed'] = [];
  for (const { cropId, areaAri } of paper) {
    const before = current[cropId] ?? 0;
    if (before === areaAri) continue;
    next[cropId] = areaAri;
    if (before > 0) changed.push({ cropId, fromAri: before, toAri: areaAri });
    else added.push({ cropId, areaAri });
  }
  const listed = new Set(paper.map((p) => p.cropId));
  const kept = Object.keys(current).filter((id) => (current[id] ?? 0) > 0 && !listed.has(id));
  return { next, added, changed, kept };
}

/** Each file's first bytes, in base64. The stated type alone proves nothing. */
const SIGNATURES: Record<DocumentFile['mediaType'], string> = {
  'application/pdf': 'JVBERi',
  'image/jpeg': '/9j/',
  'image/png': 'iVBORw',
  'image/webp': 'UklGR',
};

export type FilesProblem = 'too_many' | 'too_large' | 'bad_file';

/** Checks what Zod can't: real file types, and the limits in docs/data. */
export function filesProblem(files: DocumentFile[], data: AppData): FilesProblem | null {
  const limits = data.params.documents;
  if (files.length > limits.max_pages.value) return 'too_many';
  if (files.some((f) => !f.data.startsWith(SIGNATURES[f.mediaType]) || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data))) return 'bad_file';
  const bytes = files.reduce((sum, f) => sum + Math.floor((f.data.length * 3) / 4), 0);
  return bytes > limits.max_mb.value * 1024 * 1024 ? 'too_large' : null;
}
