// docs/data/excise-schemes.json: the excise schemes a farmer can use (docs/accize-plan.md).
// Only a `refund` brings money in on a date, so only a refund may count as revenue.
import { z } from 'zod';
import { StatusSchema } from './schemas';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A scheme can also be only a proposal, from the press, with no law behind it yet. */
export const ExciseStatusSchema = z.union([StatusSchema, z.literal('propunere')]);
export type ExciseStatus = z.infer<typeof ExciseStatusSchema>;

export const ExciseKindSchema = z.enum(['refund', 'exemption', 'at_pump']);
export type ExciseKind = z.infer<typeof ExciseKindSchema>;

const LegalBasisSchema = z.object({ act: z.string(), url: z.string().url(), status: ExciseStatusSchema });

export const ExciseSchemeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name_ro: z.string().min(1),
    kind: ExciseKindSchema,
    counts_as_revenue: z.boolean(),
    /** Another file in docs/data with the scheme's figures (rates, caps, deadlines). */
    details_file: z.string().regex(/^[a-z0-9-]+\.json$/).nullable(),
    what_ro: z.string().min(1),
    who_ro: z.string().nullable(),
    how_to_join_ro: z.string().nullable(),
    join_deadline: z
      .object({ date: IsoDate.nullable(), status: ExciseStatusSchema, note: z.string().optional() })
      .nullable(),
    valid_from: IsoDate.nullable(),
    valid_to: IsoDate.nullable(),
    payment_lag_months: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0), status: ExciseStatusSchema, note: z.string().optional() })
      .refine((l) => l.min <= l.max, 'payment_lag_months: min > max')
      .nullable(),
    replaces: z.string().optional(),
    replaced_by: z.string().nullable().optional(),
    limit: z.object({ value: z.number().int().positive(), unit: z.string(), status: ExciseStatusSchema }).optional(),
    status: ExciseStatusSchema,
    status_note: z.string().optional(),
    legal_basis: z.array(LegalBasisSchema),
    press_urls: z.array(z.string().url()).optional(),
    watch_urls: z.array(z.string().url()).min(1),
    watch_keywords: z.array(z.string().min(3)).min(1),
  })
  // Money that isn't paid out (an exemption, cheaper diesel at the pump) never goes into the salary.
  .refine((s) => !s.counts_as_revenue || s.kind === 'refund', { message: 'only a refund can count as revenue', path: ['counts_as_revenue'] })
  // A refund needs a payment delay to be put on the calendar of income.
  .refine((s) => s.kind !== 'refund' || s.payment_lag_months !== null, { message: 'a refund needs payment_lag_months', path: ['payment_lag_months'] })
  // A proposal has no law, so it can't be counted on.
  .refine((s) => s.status !== 'propunere' || !s.counts_as_revenue, { message: 'a proposal cannot count as revenue', path: ['status'] })
  .refine((s) => !s.valid_from || !s.valid_to || s.valid_from <= s.valid_to, { message: 'valid_from after valid_to', path: ['valid_to'] });
export type ExciseScheme = z.infer<typeof ExciseSchemeSchema>;

export const ExciseSchemesFileSchema = z
  .object({
    meta: z.object({ read_on: IsoDate }).passthrough(),
    schemes: z.array(ExciseSchemeSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (const s of file.schemes) {
      if (ids.has(s.id)) ctx.addIssue({ code: 'custom', message: `duplicate scheme id ${s.id}` });
      ids.add(s.id);
    }
    for (const s of file.schemes) {
      for (const ref of [s.replaces, s.replaced_by]) {
        if (ref && !ids.has(ref)) ctx.addIssue({ code: 'custom', message: `${s.id} points to unknown scheme ${ref}` });
      }
    }
  });
export type ExciseSchemesFile = z.infer<typeof ExciseSchemesFileSchema>;

/** Whether the scheme is in force on that day. Open ends count as in force; a proposal never is. */
export function exciseActiveOn(s: ExciseScheme, day: string): boolean {
  if (s.status === 'propunere') return false;
  return (!s.valid_from || s.valid_from <= day) && (!s.valid_to || day <= s.valid_to);
}

/** „Îți aduce bani” and „Plătești mai puțin”, in the file's order. */
export function groupExcise(file: ExciseSchemesFile): { revenue: ExciseScheme[]; savings: ExciseScheme[] } {
  return {
    revenue: file.schemes.filter((s) => s.counts_as_revenue),
    savings: file.schemes.filter((s) => !s.counts_as_revenue),
  };
}

// ── What the farm did about a scheme (migration 052, farm_excise_schemes) ─────────────

/**
 * interested   „Mă interesează”: the farmer wants to hear about it. Any scheme, a proposal too.
 * acord_filed  „Am depus acordul”: a scheme with a way to join (how_to_join_ro), in force.
 * approved     „Am primit acordul”: the same; only this one puts money in the plan (step 3).
 * left         „Nu mai vreau”: kept, not deleted, so the history stays.
 */
export const ExciseEnrollmentStatusSchema = z.enum(['interested', 'acord_filed', 'approved', 'left']);
export type ExciseEnrollmentStatus = z.infer<typeof ExciseEnrollmentStatusSchema>;

export interface ExciseEnrollment {
  schemeId: string;
  year: number;
  status: ExciseEnrollmentStatus;
  /** The day the acord was filed: it decides the months a mid-year acord covers. */
  acordOn: string | null;
  updatedAt: string;
}

export const SetExciseEnrollmentInputSchema = z
  .object({
    schemeId: z.string().regex(/^[a-z0-9-]+$/).max(64),
    year: z.coerce.number().int().min(2015).max(2100),
    status: ExciseEnrollmentStatusSchema,
    acordOn: IsoDate.nullable().default(null),
  })
  .strict()
  .refine((e) => e.acordOn === null || e.status === 'acord_filed' || e.status === 'approved', {
    message: 'acordOn only with an acord',
    path: ['acordOn'],
  });
export type SetExciseEnrollmentInput = z.infer<typeof SetExciseEnrollmentInputSchema>;

export type ExciseEnrollmentRefusal = 'unknown_scheme' | 'cannot_join' | 'not_in_force';

/**
 * Why this status can't be set for this scheme and year, or null when it can. „Interested” and „left” fit any
 * scheme. An acord needs a way to join and a scheme in force at some point of that year (never a proposal).
 */
export function exciseEnrollmentRefusal(file: ExciseSchemesFile, input: Pick<SetExciseEnrollmentInput, 'schemeId' | 'year' | 'status'>): ExciseEnrollmentRefusal | null {
  const s = file.schemes.find((x) => x.id === input.schemeId);
  if (!s) return 'unknown_scheme';
  if (input.status === 'interested' || input.status === 'left') return null;
  if (!s.how_to_join_ro || s.status === 'propunere') return 'cannot_join';
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-31`;
  if ((s.valid_to && s.valid_to < from) || (s.valid_from && s.valid_from > to)) return 'not_in_force';
  return null;
}
