import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { supabaseAdminRepo } from './db/admin';

/* Just enough of supabase-js for an update on one table: eq/in filters, then select. */
function fakeDb(rows: Record<string, unknown>[]) {
  const client = {
    from: () => {
      let patch: Record<string, unknown> = {};
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const q = {
        update(p: Record<string, unknown>) { patch = p; return q; },
        eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return q; },
        in(col: string, vs: readonly unknown[]) { filters.push((r) => vs.includes(r[col])); return q; },
        async select() {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          hit.forEach((r) => Object.assign(r, patch));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        },
      };
      return q;
    },
  };
  return supabaseAdminRepo(client as unknown as SupabaseClient);
}

describe('payout status from webhooks (IDEM-10)', () => {
  const payout = (status: string) => ({ id: 'p1', stripe_payout_id: 'po_1', status });

  it('a late payout.paid after payout.failed leaves it failed', async () => {
    const row = payout('pending');
    const repo = fakeDb([row]);
    expect(await repo.setPayoutStatus('po_1', 'failed')).toBe(1);
    expect(await repo.setPayoutStatus('po_1', 'paid')).toBe(0);
    expect(row.status).toBe('failed');
  });

  it('a paid payout can still fail later', async () => {
    const row = payout('paid');
    expect(await fakeDb([row]).setPayoutStatus('po_1', 'failed')).toBe(1);
    expect(row.status).toBe('failed');
  });

  it('the same event delivered again changes nothing, so a failed salary is given back once', async () => {
    const paid = payout('pending');
    const repoPaid = fakeDb([paid]);
    expect(await repoPaid.setPayoutStatus('po_1', 'paid')).toBe(1);
    expect(await repoPaid.setPayoutStatus('po_1', 'paid')).toBe(0);

    const failed = payout('creating');
    const repoFailed = fakeDb([failed]);
    expect(await repoFailed.setPayoutStatus('po_1', 'failed')).toBe(1);
    expect(await repoFailed.setPayoutStatus('po_1', 'failed')).toBe(0);
  });
});
