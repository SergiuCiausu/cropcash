import express, { Router, type Request } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { computeFarmPlan, pensionParams, type AppData } from '@cropcash/shared';
import type { AdminRepo, MoneyFarm } from '../db/admin';
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

  /** Same range as the slider on the pension page (plan-params.json). */
  const pensionAmount = () => {
    const { sliderMinLei, sliderMaxLei } = pensionParams(deps.data);
    return z.object({ monthlyLei: z.number().int().min(sliderMinLei).max(sliderMaxLei) });
  };
  const running = (farm: MoneyFarm) => [farm.pension_plans ?? []].flat().some((p) => p.status === 'active');
  /**
   * The pension comes out of the salary, so any change fixes the salary again at what is safe now,
   * as accepting the split or changing a credit does (docs/08 §1c). Stopping gives the money back.
   */
  const fixSalary = async (userId: string) => {
    const farm = await deps.admin.farmByUser(userId);
    if (farm) await deps.admin.setSalary(farm.id, computeFarmPlan(farm, deps.data).salary.salary);
  };

  r.post('/pension', async (req, res) => {
    const parsed = pensionAmount().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!farm.stripe_customer_id) return void res.status(409).json({ error: 'stripe_not_set_up' });
    if (running(farm)) return void res.status(409).json({ error: 'pension_exists' });
    await deps.money.startPension(farm, parsed.data.monthlyLei * 100);
    await fixSalary(res.locals.auth.userId);
    res.status(201).json({ ok: true });
  });

  r.put('/pension', async (req, res) => {
    const parsed = pensionAmount().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_input' });
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!running(farm)) return void res.status(409).json({ error: 'no_pension' });
    await deps.money.changePension(farm, parsed.data.monthlyLei * 100);
    await fixSalary(res.locals.auth.userId);
    res.status(204).end();
  });

  r.delete('/pension', async (req, res) => {
    const farm = await myFarm(req, res);
    if (!farm) return void res.status(404).json({ error: 'no_farm' });
    if (!running(farm)) return void res.status(409).json({ error: 'no_pension' });
    await deps.money.stopPension(farm);
    await fixSalary(res.locals.auth.userId);
    res.status(204).end();
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
