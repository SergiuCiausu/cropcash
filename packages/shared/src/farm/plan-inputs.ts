import { z } from 'zod';
import { HarvestYearSchema } from './harvests';
import { ENVELOPE_KINDS, type EnvelopeKind, type Envelopes } from '../cashflow/allocation';
import type { ExtraPayment, RecordedItem } from '../cashflow/timeline';
import { leiToBani, type Bani } from '../money';

const MonthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** "Iau un credit" (decision C): what the farmer declares. Interest is not modelled yet. */
export const CreditInputSchema = z
  .object({
    amountLei: z.number().int().min(100).max(10_000_000),
    takeMonth: MonthKey,
    repayMonth: MonthKey,
  })
  .refine((c) => c.repayMonth > c.takeMonth, { message: 'repay after take', path: ['repayMonth'] });
export type CreditInput = z.infer<typeof CreditInputSchema>;

const MAX_RECORD_LEI = 10_000_000;
const Note = z.string().trim().min(1).max(200).optional();
/** Set by the phone before the first send, so a sale or expense sent twice is saved once (migration 017). */
const ClientId = z.uuid().optional();

/** "Înregistrează o vânzare": either the total, or the tonnes and the price. */
export const SaleInputSchema = z
  .strictObject({
    cropId: z.string().min(1).max(40),
    date: z.iso.date(),
    totalLei: z.number().positive().max(MAX_RECORD_LEI).optional(),
    tonnes: z.number().positive().max(100_000).optional(),
    pricePerKgLei: z.number().positive().max(1_000).optional(),
    harvestYear: HarvestYearSchema.optional(),
    note: Note,
    clientId: ClientId,
  })
  .refine((s) => (s.totalLei !== undefined) !== (s.tonnes !== undefined && s.pricePerKgLei !== undefined), {
    message: 'a total, or tonnes with a price',
  })
  .refine((s) => s.totalLei === undefined || (s.tonnes === undefined && s.pricePerKgLei === undefined), {
    message: 'not both',
  });
export type SaleInput = z.infer<typeof SaleInputSchema>;

export function saleAmountBani(s: SaleInput): Bani {
  return leiToBani(s.totalLei ?? s.tonnes! * 1000 * s.pricePerKgLei!);
}

/** The first five are costs the plan already expects; the rest come on top. */
export const EXPENSE_CATEGORIES = ['seeds', 'fertilizer', 'treatments', 'diesel', 'field_work', 'repairs', 'rent', 'other'] as const;
const PLANNED_CATEGORIES: readonly string[] = EXPENSE_CATEGORIES.slice(0, 5);

export const ExpenseInputSchema = z.strictObject({
  category: z.enum(EXPENSE_CATEGORIES),
  amountLei: z.number().positive().max(MAX_RECORD_LEI),
  date: z.iso.date(),
  cropId: z.string().min(1).max(40).optional(),
  harvestYear: HarvestYearSchema.optional(),
  /** The envelope it comes out of, when the farmer picks one. */
  envelope: z.enum(ENVELOPE_KINDS as [EnvelopeKind, ...EnvelopeKind[]]).optional(),
  note: Note,
  clientId: ClientId,
});
export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;

/** "<calendar event id>:<year>". */
export const TaskIdSchema = z.string().regex(/^[a-z0-9-]{1,60}:\d{4}$/);

export const EnvelopesInputSchema = z.object(
  Object.fromEntries(ENVELOPE_KINDS.map((k) => [k, z.number().int().min(0)])) as Record<EnvelopeKind, z.ZodNumber>,
);

/** DB rows of a stored credit pair -> timeline extras. */
export interface StoredPayment {
  id: string;
  group_id: string | null;
  kind: string;
  direction: 'in' | 'out';
  amount_probable_bani: number;
  window_start: string;
  status: string;
}

export interface StoredTransaction {
  id: string;
  /** The farmer's own sale or expense, or what the server recorded. Null on older Stripe rows. */
  kind:
    | 'sale'
    | 'expense'
    | 'apia_advance'
    | 'apia_balance'
    | 'crop_sale'
    | 'salary'
    | 'pension'
    | 'credit'
    | 'loan_repayment'
    | null;
  category: string | null;
  crop_id: string | null;
  /** Signed: sales above zero, expenses below. */
  amount_bani: number;
  occurred_at: string;
  note: string | null;
  /** The harvest the farmer filed it under. Null means its date decides. */
  harvest_year?: number | null;
  /** Where it came from. Stripe rows have no kind, so this tells them apart. */
  source?: string;
  /** The declared payment this movement settles (a credit or its repayment). */
  expected_payment_id?: string | null;
}

export interface StoredPayout {
  id: string;
  amount_bani: number;
  scheduled_for: string;
  status: string;
}

export interface StoredPension {
  monthly_bani: number;
  status: string;
}

/** A money row as a plan reads it: tests and the payout path may carry only part of a row. */
export type MovedMoney = Pick<StoredTransaction, 'amount_bani' | 'kind' | 'occurred_at'> & Partial<StoredTransaction>;

/** Stripe money that changes what the farmer can spend. */
const STRIPE_SOURCES = new Set(['stripe_transfer', 'payout', 'subscription']);
const INCOME_KINDS = new Set(['apia_advance', 'apia_balance', 'crop_sale']);

/** The farmer's own records, newest first. */
export function recordedTransactions<T extends MovedMoney>(rows: T[]): T[] {
  return rows.filter((r) => r.kind === 'sale' || r.kind === 'expense').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** Net money that really moved: the farmer's records and everything through Stripe. */
export function recordedBalance(rows: MovedMoney[]): Bani {
  return rows
    .filter((r) => r.kind !== null || STRIPE_SOURCES.has(r.source ?? ''))
    .reduce((sum, r) => sum + r.amount_bani, 0);
}

/** A pension_plans row comes back as one object or a list, depending on the query. */
export function activePensionMonthly(plans: StoredPension | StoredPension[] | null | undefined): Bani {
  return [plans ?? []].flat().find((p) => p.status === 'active')?.monthly_bani ?? 0;
}

/** A cost the demo clock paid has no category, and it's always one the plan expected. */
const replacesPlannedCost = (r: MovedMoney) => PLANNED_CATEGORIES.includes(r.category ?? '') || (!r.category && !!r.crop_id);

export function recordedFromStored(rows: MovedMoney[]): RecordedItem[] {
  const own = recordedTransactions(rows).map((r): RecordedItem => ({
    kind: r.kind as 'sale' | 'expense',
    amount: Math.abs(r.amount_bani),
    date: r.occurred_at.slice(0, 10),
    cropId: r.crop_id ?? undefined,
    replacesPlanned: r.kind === 'sale' ? !!r.crop_id : replacesPlannedCost(r),
  }));
  // A credit also arrives by transfer, but it's borrowed money, not income.
  const income = rows
    .filter((r) => r.kind !== 'credit' && (r.source === 'stripe_transfer' || INCOME_KINDS.has(r.kind ?? '')))
    .map((r): RecordedItem => ({
      kind: (r.kind ?? r.category) === 'crop_sale' ? 'sale' : ((r.kind ?? r.category) as 'apia_advance' | 'apia_balance'),
      amount: r.amount_bani,
      date: r.occurred_at.slice(0, 10),
      cropId: r.crop_id ?? undefined,
      replacesPlanned: true,
    }));
  return [...own, ...income];
}

export function extrasFromStored(rows: StoredPayment[]): ExtraPayment[] {
  return rows
    .filter((r) => r.status === 'planned' && (r.kind === 'credit' || r.kind === 'loan_repayment'))
    .map((r) => ({
      id: r.id,
      kind: r.kind as ExtraPayment['kind'],
      direction: r.direction,
      amount: r.amount_probable_bani,
      date: r.window_start,
    }));
}

export interface DeclaredCredit {
  groupId: string;
  amount: number;
  takeDate: string;
  repayDate: string | null;
}

export function declaredCredits(rows: StoredPayment[]): DeclaredCredit[] {
  const groups = new Map<string, DeclaredCredit>();
  for (const r of rows) {
    if (!r.group_id || r.status !== 'planned') continue;
    const g = groups.get(r.group_id) ?? { groupId: r.group_id, amount: 0, takeDate: '', repayDate: null };
    if (r.kind === 'credit') {
      g.amount = r.amount_probable_bani;
      g.takeDate = r.window_start;
    } else if (r.kind === 'loan_repayment') {
      g.repayDate = r.window_start;
    }
    groups.set(r.group_id, g);
  }
  return [...groups.values()].filter((g) => g.takeDate).sort((a, b) => a.takeDate.localeCompare(b.takeDate));
}

export function envelopesFromStored(rows: { kind: string; balance_bani: number }[]): Envelopes {
  const out = Object.fromEntries(ENVELOPE_KINDS.map((k) => [k, 0])) as Envelopes;
  for (const r of rows) if ((ENVELOPE_KINDS as string[]).includes(r.kind)) out[r.kind as EnvelopeKind] = r.balance_bani;
  return out;
}
