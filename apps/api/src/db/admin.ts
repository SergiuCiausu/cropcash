import type { SupabaseClient } from '@supabase/supabase-js';
import type { FarmRow } from './repo';

/** A farm with everything the money flows need (read with the service key). */
export interface MoneyFarm extends FarmRow {
  user_id: string;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  test_clock_id: string | null;
  demo_now: string | null;
}

export interface NewTransaction {
  farmer_id: string;
  amount_bani: number;
  kind: 'apia_advance' | 'apia_balance' | 'crop_sale' | 'salary' | 'pension' | 'expense' | 'credit' | 'loan_repayment';
  occurred_at: string;
  source: 'stripe_transfer' | 'payout' | 'subscription' | 'manual';
  stripe_object_id: string;
  crop_id?: string | null;
  expected_payment_id?: string | null;
}

export const MONEY_FARM_SELECT = [
  'id, user_id, name, county, birth_year, start_balance_bani, demo_now, salary_bani, harvests, apia_decision',
  'stripe_account_id, stripe_customer_id, test_clock_id',
  'parcels (crop_id, area_ari, is_arable, planted_month)',
  'envelopes (kind, balance_bani)',
  'expected_payments (id, group_id, kind, direction, amount_probable_bani, window_start, status)',
  'transactions (amount_bani, kind, category, occurred_at, crop_id, source, expected_payment_id)',
  'pension_plans (monthly_bani, status, stripe_subscription_id, start_key)',
].join(', ');

/** The money operations that must not run twice at once for one farm. */
export type LeaseOp = 'stripe_setup' | 'pension' | 'demo_money';

/**
 * Writes that only the server may do (money records, Stripe ids, the demo clock).
 * Uses the service key: callers must have checked who the farm belongs to.
 */
export interface AdminRepo {
  farmByUser(userId: string): Promise<MoneyFarm | null>;
  farmBy(field: 'stripe_account_id' | 'stripe_customer_id' | 'id', value: string): Promise<MoneyFarm | null>;
  setStripeIds(farmerId: string, ids: Partial<Pick<MoneyFarm, 'stripe_account_id' | 'stripe_customer_id' | 'test_clock_id' | 'demo_now'>>): Promise<void>;
  /** Idempotent on stripe_object_id: a webhook and the API can both record the same payment. */
  recordTransaction(tx: NewTransaction): Promise<void>;
  /**
   * Claims the salary of one payday before Stripe is asked to pay it. Null when this call made the
   * claim; otherwise the row already there, so a retry never pays the same month twice.
   */
  claimPayout(p: { farmer_id: string; amount_bani: number; scheduled_for: string }): Promise<{ status: string; stripe_payout_id: string | null } | null>;
  /** Fills in a claimed salary: the Stripe payout and its status, or 'failed'. */
  finishPayout(farmerId: string, scheduledFor: string, patch: { stripe_payout_id: string | null; status: 'pending' | 'failed' }): Promise<void>;
  /** Returns how many rows were updated (0 when the payout isn't recorded yet). */
  setPayoutStatus(stripePayoutId: string, status: 'paid' | 'failed'): Promise<number>;
  /** Takes back a salary that never reached the farmer, so the money counts as theirs again. */
  removePayoutTransaction(stripePayoutId: string): Promise<void>;
  upsertPension(p: { farmer_id: string; monthly_bani: number; stripe_subscription_id: string; started_at: string; start_key: string | null }): Promise<void>;
  /** A new monthly amount, or a status. A stopped plan can be started again with upsertPension. */
  updatePension(farmerId: string, patch: { monthly_bani?: number; status?: 'active' | 'stopping' | 'stopped' }): Promise<void>;
  /** One money operation at a time per farm (migration 018). False when someone else holds it. */
  takeLease(farmerId: string, op: LeaseOp, holder: string, ttlSeconds: number): Promise<boolean>;
  releaseLease(farmerId: string, op: LeaseOp, holder: string): Promise<void>;
  /** Fixes the salary paid each month (docs/08 §1c). */
  setSalary(farmerId: string, salaryBani: number): Promise<void>;
}

/**
 * Which payout statuses a webhook may move from (IDEM-10). Stripe doesn't promise order: a late
 * payout.paid after payout.failed must not mark it paid again, because the failed one already gave
 * the salary back. A paid payout can still fail later, so failed is allowed from paid. A status the
 * row already has is not in its own list, so a redelivered event changes nothing (0 rows).
 */
export const PAYOUT_MOVES_FROM: Record<'paid' | 'failed', readonly string[]> = {
  paid: ['pending', 'creating'],
  failed: ['pending', 'creating', 'paid'],
};

export function supabaseAdminRepo(admin: SupabaseClient): AdminRepo {
  const one = async (field: string, value: string) => {
    const { data, error } = await admin.from('farmers').select(MONEY_FARM_SELECT).eq(field, value).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as MoneyFarm | null) ?? null;
  };
  return {
    farmByUser: (userId) => one('user_id', userId),
    farmBy: (field, value) => one(field, value),

    async setStripeIds(farmerId, ids) {
      const { error } = await admin.from('farmers').update(ids).eq('id', farmerId);
      if (error) throw new Error(error.message);
    },

    async recordTransaction(tx) {
      const { error } = await admin
        .from('transactions')
        .upsert(tx, { onConflict: 'stripe_object_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },

    async claimPayout(p) {
      const { data, error } = await admin
        .from('payouts')
        .upsert({ ...p, stripe_payout_id: null, status: 'creating' }, { onConflict: 'farmer_id,scheduled_for', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(error.message);
      if (data?.length) return null;
      const existing = await admin
        .from('payouts')
        .select('status, stripe_payout_id')
        .eq('farmer_id', p.farmer_id)
        .eq('scheduled_for', p.scheduled_for)
        .single();
      if (existing.error) throw new Error(existing.error.message);
      return existing.data as { status: string; stripe_payout_id: string | null };
    },

    async finishPayout(farmerId, scheduledFor, patch) {
      const { error } = await admin.from('payouts').update(patch).eq('farmer_id', farmerId).eq('scheduled_for', scheduledFor);
      if (error) throw new Error(error.message);
    },

    async setPayoutStatus(stripePayoutId, status) {
      const { data, error } = await admin
        .from('payouts')
        .update({ status })
        .eq('stripe_payout_id', stripePayoutId)
        .in('status', PAYOUT_MOVES_FROM[status])
        .select('id');
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },

    async removePayoutTransaction(stripePayoutId) {
      const { error } = await admin
        .from('transactions')
        .delete()
        .eq('stripe_object_id', stripePayoutId)
        .eq('source', 'payout');
      if (error) throw new Error(error.message);
    },

    async upsertPension(p) {
      const { error } = await admin
        .from('pension_plans')
        .upsert({ ...p, vehicle: 'pilon3', status: 'active' }, { onConflict: 'farmer_id' });
      if (error) throw new Error(error.message);
    },

    async updatePension(farmerId, patch) {
      const { error } = await admin.from('pension_plans').update(patch).eq('farmer_id', farmerId);
      if (error) throw new Error(error.message);
    },

    async setSalary(farmerId, salaryBani) {
      const { error } = await admin.from('farmers').update({ salary_bani: salaryBani }).eq('id', farmerId);
      if (error) throw new Error(error.message);
    },

    async takeLease(farmerId, op, holder, ttlSeconds) {
      const { data, error } = await admin.rpc('take_farm_lease', { p_farmer: farmerId, p_op: op, p_holder: holder, p_ttl_s: ttlSeconds });
      if (error) throw new Error(error.message);
      return data === true;
    },

    async releaseLease(farmerId, op, holder) {
      const { error } = await admin.rpc('release_farm_lease', { p_farmer: farmerId, p_op: op, p_holder: holder });
      if (error) throw new Error(error.message);
    },
  };
}
