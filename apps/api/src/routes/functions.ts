import { Router } from 'express';
import {
  buildFarmPlan,
  farmToday,
  findRead,
  monthKey,
  todayInRomania,
  type AppData,
  type FunctionResult,
  type ReadFunction,
  type SubsidyParams,
} from '@cropcash/shared';
import type { Repo } from '../db/repo';
import type { RatesProvider } from '../fx/rates';
import type { MonitorReader } from '../monitor/reader';

export interface ReadDeps {
  repo: Repo;
  data: AppData;
  params: SubsidyParams;
  now: () => Date;
  getRates: RatesProvider;
  monitor?: MonitorReader;
}

export type ReadOutcome =
  | { ok: true; result: FunctionResult<unknown> }
  | { ok: false; status: number; error: 'invalid_input' | 'no_farm' | 'monitor_unavailable' };

/**
 * Runs read functions for one signed-in farmer. The farm and its plan load once, on the first
 * call, so the assistant can call several tools in one answer without reloading them.
 */
export function readRunner({ repo, data, params, now, getRates, monitor }: ReadDeps, token: string) {
  let loaded: Promise<{ farm: NonNullable<Awaited<ReturnType<Repo['getMyFarm']>>>; today: string; plan: ReturnType<typeof buildFarmPlan> } | null> | undefined;
  const load = () =>
    (loaded ??= repo.getMyFarm(token).then((farm) => {
      if (!farm) return null;
      const today = farmToday(farm, todayInRomania(now()));
      return { farm, today, plan: buildFarmPlan(farm, data, { month: monthKey(today), params }) };
    }));

  return {
    /** The farm's own today, which the demo clock can move. Null without a farm. */
    today: async () => (await load())?.today ?? null,

    async run(fn: ReadFunction, input: unknown): Promise<ReadOutcome> {
      if (!fn.input.safeParse(input).success) return { ok: false, status: 400, error: 'invalid_input' };
      const ctx = await load();
      if (!ctx) return { ok: false, status: 404, error: 'no_farm' };
      let monitorData;
      if (fn.needs.length > 0) {
        try {
          if (!monitor) throw new Error('no monitor reader');
          monitorData = await monitor.load(fn.needs, input, token);
        } catch (err) {
          console.error('[monitor]', err);
          return { ok: false, status: 503, error: 'monitor_unavailable' };
        }
      }
      const rates = fn.usesRates ? await getRates() : undefined;
      return { ok: true, result: fn.execute(input, { ...ctx, data, rates, monitor: monitorData }) };
    },
  };
}

/**
 * Runs a read function from the registry for the signed-in farmer. Writes keep their own
 * routes, and an unknown name and a write get the same answer.
 */
export function functionsRouter(deps: ReadDeps): Router {
  const r = Router();

  /** For the currency toggle. Needs no farm, so it works during onboarding too. */
  r.get('/exchange-rates', async (_req, res) => {
    res.json({ rates: await deps.getRates() });
  });

  r.post('/functions/:name', async (req, res) => {
    const fn = findRead(req.params.name);
    if (!fn) {
      res.status(404).json({ error: 'unknown_function' });
      return;
    }
    const outcome = await readRunner(deps, res.locals.auth.token).run(fn, req.body ?? {});
    if (outcome.ok) res.json(outcome.result);
    else res.status(outcome.status).json({ error: outcome.error });
  });

  return r;
}
