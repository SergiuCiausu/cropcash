import { z } from 'zod';
import type { AppData } from '../data';
import { EXPENSE_CATEGORIES } from '../farm';
import type { Bani } from '../money';

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
 * money. There's deliberately no field for a name, CNP, IBAN or address.
 */
export const DocumentExtractionSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  year: z.string().nullable(),
  crops: z.array(z.object({ crop_id: z.string().nullable(), name: z.string(), area: z.string() })),
  amount: z.string().nullable(),
  date: z.string().nullable(),
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
  crop_id: z.string().nullable(),
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

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
}

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

/** Turns the AI's text into checked values. A cerere repeats crops across parcels, so they add up here. */
export function normalizeReading(raw: DocumentExtraction, data: AppData): DocumentReading {
  const known = new Set(data.crops.crops.map((c) => c.id));
  const ari = new Map<string, number>();
  const unknown = new Set<string>();
  if (isApia(raw.kind)) {
    for (const row of raw.crops) {
      const area = parseAreaText(row.area);
      if (!area) continue;
      if (row.crop_id && known.has(row.crop_id)) ari.set(row.crop_id, (ari.get(row.crop_id) ?? 0) + area);
      else unknown.add(row.name.trim().slice(0, 80));
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
  };
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
