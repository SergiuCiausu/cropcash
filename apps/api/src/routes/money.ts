import express, { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { z } from 'zod';
import { computeFarmPlan, pensionParams, type AppData } from '@cropcash/shared';
import type { AdminRepo, LeaseOp, MoneyFarm } from '../db/admin';
import { addMonthsIso, type MoneyService } from '../stripe/money';

export interface MoneyDeps {
  money: MoneyService;
  admin: AdminRepo;
  /** Verifies the Stripe-Signature header against the raw body (STRIPE_WEBHOOK_SECRET). */
  verifyWebhook: (raw: Buffer, signature: string) => Stripe.Event;
  /** /api/demo/* only works when DEMO_MODE=true (test mode demo controls). */
  demoMode: boolean;
  data: AppData;
}

const clientIp = (req: Request) => (req.ip ?? '127.0.0.1').replace('::ffff:', '') || '127.0.0.1';

/** How long each money operation may hold its farm's lease before another call can take it. */
const LEASE_SECONDS: Record<LeaseOp, number> = { stripe_setup: 120, pension: 120, demo_money: 900 };

/** The phone's key for one intent (docs/idempotency-plan.md, M1). Anything else counts as none. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const intentKey = (req: Request) => {
  const key = req.header('idempotency-key');
  return key && UUID.test(key) ? key.toLowerCase() : null;
};

/** Stripe webhook: raw body, mounted before express.json() (docs/08 §3). */
export function webhookRouter(deps: MoneyDeps): Router {
  const r = Router();
  r.post('/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    let event: Stripe.Event;
    try {
      event = deps.verifyWebhook(req.body as Buffer, req.header('stripe-signature') ?? '');
    } catch {
      res.status(400).json({ error: 'bad_signature' });
      return;
    }
    await deps.money.handleEvent(event);
    res.json({ received: true });
  });
  return r;
}

/** Authenticated money routes. The farm is always looked up from the caller's own user id. */
export function moneyRouter(deps: MoneyDeps): Router {
  const r = Router();
  const myFarm = (_req: Request, res: Response) => deps.admin.farmByUser(res.locals.auth.userId);

  /**
   * Runs `fn` holding the farm's lease for `op`, so a second tab or a tap again can't run the same
   * money operation at the same time. The other caller gets 409 busy and may try again later.
   */
  const withLease = async (farm: MoneyFarm, op: LeaseOp, res: Response, fn: () => Promise<void>) => {
    const holder = randomUUID();
    if (!(await deps.admin.takeLease(farm.id, op, holder, LEASE_SECONDS[op]))) {
      res.status(409).json({ error: 'busy' });
      return;
    }
    try {
      await fn();
    } finally {
      await deps.admin.releaseLease(farm.id, op, holder).catch(() => undefined);
    }
  };

  r.post('/stripe/setup', async (req, res) => {
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    await withLease(farm, 'stripe_setup', res, async () => {
      // Read again under the lease: a call that just finished may have set everything up.
      const fresh = (await deps.admin.farmBy('id', farm.id)) ?? farm;
      const ready = await deps.money.setup(fresh, res.locals.auth.email, clientIp(req));
      res.json({ stripeAccountId: ready.stripe_account_id, demoNow: ready.demo_now });
    });
  });

  /** Same range as the slider on the pension page (plan-params.json). */
  const pensionAmount = () => {
    const { sliderMinLei, sliderMaxLei } = pensionParams(deps.data);
    return z.object({ monthlyLei: z.number().int().min(sliderMinLei).max(sliderMaxLei) });
  };
  type Plan = { status: string; monthly_bani: number; start_key?: string | null };
  const pensionOf = (farm: MoneyFarm) => [farm.pension_plans ?? []].flat()[0] as Plan | undefined;
  /**
   * The pension comes out of the salary, so any change fixes the salary again at what is safe now,
   * as accepting the split or changing a credit does (docs/08 §1c). Stopping gives the money back.
   */
  const fixSalary = async (userId: string) => {
    const farm = await deps.admin.farmByUser(userId);
    if (farm) await deps.admin.setSalary(farm.id, computeFarmPlan(farm, deps.data).salary.salary);
  };
  /** Under the lease, the farm as it is now: a call that just finished may have changed it. */
  const reread = async (farm: MoneyFarm) => (await deps.admin.farmBy('id', farm.id)) ?? farm;

  /**
   * Starts the pension. The phone sends one Idempotency-Key per "Pornești pensia?" dialog: the same
   * key again (an answer lost on the way) gets 201 again, a pension started some other way gets 409.
   */
  r.post('/pension', async (req, res) => {
    const parsed = pensionAmount().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.stripe_customer_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    const key = intentKey(req);
    await withLease(farm, 'pension', res, async () => {
      const plan = pensionOf(await reread(farm));
      if (plan?.status === 'active' || plan?.status === 'stopping') {
        if (key && plan.status === 'active' && plan.start_key === key) return void res.status(201).json({ ok: true });
        return void res.status(409).json({ error: 'pension_exists' });
      }
      await deps.money.startPension(farm, parsed.data.monthlyLei * 100, key);
      await fixSalary(res.locals.auth.userId);
      res.status(201).json({ ok: true });
    });
  });

  r.put('/pension', async (req, res) => {
    const parsed = pensionAmount().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (pensionOf(farm)?.status !== 'active') return void res.status(409).json({ error: 'no_pension' });
    await withLease(farm, 'pension', res, async () => {
      const now = await reread(farm);
      const plan = pensionOf(now);
      if (plan?.status !== 'active') return void res.status(409).json({ error: 'no_pension' });
      // Already this amount (the same change sent twice): nothing to ask Stripe.
      if (plan.monthly_bani !== parsed.data.monthlyLei * 100) await deps.money.changePension(now, parsed.data.monthlyLei * 100);
      await fixSalary(res.locals.auth.userId);
      res.status(204).end();
    });
  });

  /** Stopping a pension that is already stopped answers 204: it is what the farmer asked for. */
  r.delete('/pension', async (req, res) => {
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    const status = pensionOf(farm)?.status;
    if (status === 'stopped') return void res.status(204).end();
    if (status !== 'active' && status !== 'stopping') return void res.status(409).json({ error: 'no_pension' });
    await withLease(farm, 'pension', res, async () => {
      const now = await reread(farm);
      const plan = pensionOf(now);
      if (plan?.status === 'active' || plan?.status === 'stopping') await deps.money.stopPension(now);
      await fixSalary(res.locals.auth.userId);
      res.status(204).end();
    });
  });

  // ── Demo controls (test mode only) ───────────────────────────────────────
  r.use('/demo', (_req, res, next) => (deps.demoMode ? next() : res.status(404).json({ error: 'not_found' })));

  /**
   * "Simulează avansul APIA": the advance from the plan, paid into the farmer's account.
   * Asked again once it arrived, it answers 200 `already`: the farmer has what they asked for.
   */
  r.post('/demo/income', async (req, res) => {
    const parsed = z.object({ kind: z.literal('apia_advance') }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.stripe_account_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    await withLease(farm, 'demo_money', res, async () => {
      const now = await reread(farm);
      const plan = computeFarmPlan(now, deps.data);
      if (plan.received.some((x) => x.kind === 'apia_advance')) return void res.json({ event: null, already: true });
      const event = await deps.money.income(now, {
        type: 'income',
        kind: 'apia_advance',
        amount: plan.subsidies.totals.advanceLei,
        date: plan.today,
      });
      res.status(201).json({ event });
    });
  });

  /**
   * "Dăm timpul înainte": salaries, incomes and pension for the skipped months.
   * The phone sends `from`, the demo date it saw. The target is `from` + months, so the same tap
   * sent twice moves the clock once: at the target it answers `already`, part way (a run that
   * crashed) it goes on, and anywhere else it answers 409 stale_clock.
   */
  r.post('/demo/advance', async (req, res) => {
    const parsed = z
      .object({ months: z.number().int().min(1).max(12), from: z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v))).optional() })
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.test_clock_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    await withLease(farm, 'demo_money', res, async () => {
      const now = await reread(farm);
      const from = parsed.data.from ?? now.demo_now!;
      const target = addMonthsIso(from, parsed.data.months);
      const at = Date.parse(now.demo_now!);
      if (at === Date.parse(target)) return void res.json({ events: [], already: true });
      if (at < Date.parse(from) || at > Date.parse(target)) return void res.status(409).json({ error: 'stale_clock' });
      res.json({ events: await deps.money.advanceTo(farm.id, target) });
    });
  });

  return r;
}
