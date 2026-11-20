import { Router } from 'express';
import type { Repo } from '../db/repo';
import { RainOutlookUnavailableError, type RainOutlookService } from '../rain-outlook';

/** Rain over the next years for the signed-in farmer's county. The county comes from the farm, never the client. */
export function rainOutlookRouter(repo: Repo, rain: RainOutlookService): Router {
  const r = Router();

  r.get('/rain-outlook', async (_req, res) => {
    const farm = await repo.getMyFarm(res.locals.auth.token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    try {
      const outlook = await rain.get(farm.county);
      if (!outlook) {
        res.status(404).json({ error: 'unknown_county' });
        return;
      }
      res.json(outlook);
    } catch (err) {
      if (!(err instanceof RainOutlookUnavailableError)) throw err;
      res.status(503).json({ error: 'rain_outlook_unavailable' });
    }
  });

  return r;
}
