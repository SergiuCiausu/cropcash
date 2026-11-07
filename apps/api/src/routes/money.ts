import express, { Router, type Request } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { computeFarmPlan, type AppData } from '@cropcash/shared';
import type { AdminRepo } from '../db/admin';
import type { MoneyService } from '../stripe/money';

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
  const myFarm = (req: Request, res: express.Response) => deps.admin.farmByUser(res.locals.auth.userId);

  r.post('/stripe/setup', async (req, res) => {
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    const ready = await deps.money.setup(farm, res.locals.auth.email, clientIp(req));
    res.json({ stripeAccountId: ready.stripe_account_id, demoNow: ready.demo_now });
  });

  r.post('/pension', async (req, res) => {
    const parsed = z.object({ monthlyLei: z.number().int().min(10).max(5000) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.stripe_customer_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    const plans = farm.pension_plans;
    const active = Array.isArray(plans) ? plans.some((p) => p.status === 'active') : plans?.status === 'active';
    if (active) return void res.status(409).json({ error: 'pension_exists' });
    await deps.money.startPension(farm, parsed.data.monthlyLei * 100);
    res.status(201).json({ ok: true });
  });

  // ── Demo controls (test mode only) ───────────────────────────────────────
  r.use('/demo', (_req, res, next) => (deps.demoMode ? next() : res.status(404).json({ error: 'not_found' })));

  /** "Simulează avansul APIA": the advance from the plan, paid into the farmer's account. */
  r.post('/demo/income', async (req, res) => {
    const parsed = z.object({ kind: z.literal('apia_advance') }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.stripe_account_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    const plan = computeFarmPlan(farm, deps.data);
    if (plan.received.some((x) => x.kind === 'apia_advance')) return void res.status(409).json({ error: 'already_received' });
    const event = await deps.money.income(farm, {
      type: 'income',
      kind: 'apia_advance',
      amount: plan.subsidies.totals.advanceLei,
      date: plan.today,
    });
    res.status(201).json({ event });
  });

  /** "Dăm timpul înainte": salaries, incomes and pension for the skipped months. */
  r.post('/demo/advance', async (req, res) => {
    const parsed = z.object({ months: z.number().int().min(1).max(12) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.test_clock_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    const events = await deps.money.advance(farm.id, parsed.data.months);
    res.json({ events });
  });

  return r;
}
