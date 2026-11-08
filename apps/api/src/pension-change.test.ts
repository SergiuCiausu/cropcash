/* Changing the pension amount, sent twice or back and forth (docs/idempotency-plan.md, IDEM-09). */
import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { loadData } from '@cropcash/shared';
import type { AdminRepo } from './db/admin';
import { MoneyService } from './stripe/money';

const farm = { id: 'farm-1', pension_plans: { status: 'active', monthly_bani: 20_000, stripe_subscription_id: 'sub_1' } } as never;

/** A fake Stripe with one subscription and a price list keyed by lookup_key. */
function fakeStripe(startPrice = { id: 'price_200', unit_amount: 20_000 }) {
  const prices = new Map<string, { id: string; unit_amount: number }>([['cc-pension-20000', startPrice]]);
  const item = { id: 'si_1', price: startPrice };
  const calls = { create: 0, update: 0 };
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ items: { data: [item] } }),
      update: async (_id: string, body: { items: { price: string }[] }) => {
        calls.update++;
        item.price = [...prices.values()].find((p) => p.id === body.items[0]!.price)!;
      },
    },
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({ data: prices.has(lookup_keys[0]!) ? [prices.get(lookup_keys[0]!)!] : [] }),
      create: async (body: { unit_amount: number; lookup_key: string }) => {
        calls.create++;
        const p = { id: `price_${body.unit_amount / 100}`, unit_amount: body.unit_amount };
        prices.set(body.lookup_key, p);
        return p;
      },
    },
  };
  const admin = { updatePension: vi.fn(async () => {}) } as unknown as AdminRepo;
  return { money: new MoneyService(stripe as unknown as Stripe, admin, loadData(), async () => {}), calls, item, admin };
}

describe('change pension (IDEM-09)', () => {
  it('the same change twice makes one price and one update', async () => {
    const { money, calls, item } = fakeStripe();
    await money.changePension(farm, 30_000);
    await money.changePension(farm, 30_000);
    expect(calls).toEqual({ create: 1, update: 1 });
    expect(item.price.unit_amount).toBe(30_000);
  });

  it('going back to an earlier amount reuses its price and really changes it', async () => {
    const { money, calls, item } = fakeStripe();
    await money.changePension(farm, 30_000);
    await money.changePension(farm, 20_000);
    await money.changePension(farm, 30_000);
    expect(calls.create).toBe(1);
    expect(calls.update).toBe(3);
    expect(item.price.unit_amount).toBe(30_000);
  });

  it('still saves the amount when Stripe already has it', async () => {
    const { money, calls, admin } = fakeStripe();
    await money.changePension(farm, 20_000);
    expect(calls).toEqual({ create: 0, update: 0 });
    expect(admin.updatePension).toHaveBeenCalledWith('farm-1', { monthly_bani: 20_000 });
  });
});
