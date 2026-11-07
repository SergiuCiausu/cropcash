import { z } from 'zod';
import { ENVELOPE_KINDS, type EnvelopeKind, type Envelopes } from '../cashflow/allocation';
import type { ExtraPayment } from '../cashflow/timeline';

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
