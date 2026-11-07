import { Router } from 'express';
import {
  buildFarmPlan,
  farmToday,
  findRead,
  monthKey,
  todayInRomania,
  type AppData,
  type SubsidyParams,
} from '@cropcash/shared';
import type { Repo } from '../db/repo';
import type { RatesProvider } from '../fx/rates';
import type { MonitorReader } from '../monitor/reader';

/**
 * Runs a read function from the registry for the signed-in farmer. Writes keep their own
 * routes, and an unknown name and a write get the same answer.
 */
export function functionsRouter(
  repo: Repo,
  data: AppData,
  params: SubsidyParams,
  now: () => Date,
  getRates: RatesProvider,
  monitor?: MonitorReader,
): Router {
  const r = Router();

  /** For the currency toggle. Needs no farm, so it works during onboarding too. */
  r.get('/exchange-rates', async (_req, res) => {
    res.json({ rates: await getRates() });
  });

  r.post('/functions/:name', async (req, res) => {
    const fn = findRead(req.params.name);
    if (!fn) {
      res.status(404).json({ error: 'unknown_function' });
      return;
    }
    const input = req.body ?? {};
    if (!fn.input.safeParse(input).success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const farm = await repo.getMyFarm(res.locals.auth.token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const today = farmToday(farm, todayInRomania(now()));
    const plan = buildFarmPlan(farm, data, { month: monthKey(today), params });
    let monitorData;
    if (fn.needs.length > 0) {
      try {
        if (!monitor) throw new Error('no monitor reader');
        monitorData = await monitor.load(fn.needs, input, res.locals.auth.token);
      } catch (err) {
        console.error('[monitor]', err);
        res.status(503).json({ error: 'monitor_unavailable' });
        return;
      }
    }
    res.json(fn.execute(input, { farm, plan, data, today, rates: fn.usesRates ? await getRates() : undefined, monitor: monitorData }));
  });

  return r;
}
