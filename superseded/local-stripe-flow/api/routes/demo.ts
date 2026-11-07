import { Router } from 'express';
import {
  AdvanceClockInputSchema,
  StartPensionInputSchema,
  buildFarmPlan,
  farmToday,
  monthKey,
  pensionMinimum,
  proposeSplit,
  todayInRomania,
} from '@cropcash/shared';
import type { Repo } from '../db/repo';
import { advanceFarm, type MoneyDeps } from '../jobs/payoutScheduler';

/**
 * Stripe objects appear the first time money moves, not at onboarding: signing up must keep
 * working when Stripe is slow, and the farmer never sees them. Returns the full farm.
 */
async function ensureStripe({ gateway, ledger }: MoneyDeps, farmerId: string, today: string) {
  const farm = await ledger.farmById(farmerId);
  if (!farm) return null;
  if (farm.stripe_account_id && farm.stripe_customer_id && farm.test_clock_id) return farm;
  const stripe_account_id = farm.stripe_account_id ?? (await gateway.createAccount({ id: farmerId, name: farm.name ?? '' }));
  const test_clock_id = farm.test_clock_id ?? (await gateway.createClock(today));
  const stripe_customer_id = farm.stripe_customer_id ?? (await gateway.createCustomer(farmerId, test_clock_id));
  const ids = { stripe_account_id, stripe_customer_id, test_clock_id };
  await ledger.saveStripeIds(farmerId, ids);
  await ledger.setAppDate(farmerId, today);
  return { ...farm, ...ids, app_date: today };
}

/** Starting the pension. Real in the app, simulated by a test subscription. */
export function pensionRouter(repo: Repo, deps: MoneyDeps, now: () => Date): Router {
  const r = Router();

  r.post('/pension', async (req, res) => {
    const parsed = StartPensionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { token } = res.locals.auth;
    const own = await repo.getMyFarm(token);
    if (!own) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const { monthly } = parsed.data;
    const minimum = pensionMinimum(deps.data, own.pension_fund_id);
    if (monthly < minimum.amount) {
      res.status(400).json({ error: 'below_minimum', minimum: minimum.amount });
      return;
    }
    const today = farmToday(own, todayInRomania(now()));
    const farm = await ensureStripe(deps, own.id, today);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    if ([farm.pension_plans ?? []].flat().some((p) => p.status === 'active')) {
      res.status(409).json({ error: 'already_started' });
      return;
    }
    const subscriptionId = await deps.gateway.subscribe(farm.stripe_customer_id!, monthly);
    await deps.ledger.savePension(own.id, monthly, subscriptionId, farm.app_date ?? today);
    res.status(201).json({ monthly });
  });

  return r;
}

/** Only mounted with DEMO_MODE on. */
export function demoRouter(repo: Repo, deps: MoneyDeps, now: () => Date): Router {
  const r = Router();
  const { data, params, gateway, ledger } = deps;
  const advancing = new Set<string>();

  r.post('/demo/simulate-advance', async (_req, res) => {
    const { token } = res.locals.auth;
    const own = await repo.getMyFarm(token);
    if (!own) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    if ((own.transactions ?? []).some((t) => t.category === 'apia_advance')) {
      res.status(409).json({ error: 'already_received' });
      return;
    }
    const today = farmToday(own, todayInRomania(now()));
    const farm = await ensureStripe(deps, own.id, today);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const before = buildFarmPlan(farm, data, { month: monthKey(today), params });
    const amount = before.subsidies.totals.advanceLei;
    if (amount <= 0) {
      res.status(409).json({ error: 'no_advance' });
      return;
    }
    const objectId = await gateway.sendIncome({
      accountId: farm.stripe_account_id!,
      farmerId: own.id,
      amount,
      kind: 'apia_advance',
      key: `income-${own.id}-apia-advance`,
    });
    // Saved here as well as in the webhook, so the split screen never waits for it.
    await ledger.applyIncome({ farmerId: own.id, amountBani: amount, at: `${today}T12:00:00Z`, category: 'apia_advance', objectId });
    const fresh = await repo.getMyFarm(token);
    const plan = buildFarmPlan(fresh ?? farm, data, { month: monthKey(today), params });
    res.status(201).json({ amount, ...proposeSplit(plan, amount, true) });
  });

  r.post('/demo/advance-clock', async (req, res) => {
    const parsed = AdvanceClockInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const own = await repo.getMyFarm(res.locals.auth.token);
    if (!own) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const farm = await ledger.farmById(own.id);
    if (!farm?.test_clock_id || !farm.app_date) {
      res.status(409).json({ error: 'no_money_yet' });
      return;
    }
    if (advancing.has(own.id)) {
      res.status(409).json({ error: 'busy' });
      return;
    }
    advancing.add(own.id);
    // Takes about a minute, so the page watches app_date instead of waiting here.
    void advanceFarm(deps, own.id, farm.test_clock_id, farm.app_date, parsed.data.months)
      .catch((err) => console.error('[demo] advancing the clock failed', err))
      .finally(() => advancing.delete(own.id));
    res.status(202).json({ from: farm.app_date });
  });

  return r;
}
