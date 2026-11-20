import { Router } from 'express';
import { exciseEnrollmentRefusal, SetExciseEnrollmentInputSchema, type AppData } from '@cropcash/shared';
import { ExciseRefused, type ExciseStore } from '../db/excise';
import type { Repo } from '../db/repo';

/**
 * The excise schemes the farm joined (docs/accize-plan.md §2.2). The catalogue is docs/data/excise-schemes.json,
 * already in the app; these routes only keep what the farmer said about each scheme, per year.
 * `data` is read on each request, so a published admin change to the file applies at once.
 * Not money moving: the app may queue a change made offline.
 */
export function exciseRouter(repo: Repo, store: ExciseStore, data: Pick<AppData, 'excise'>): Router {
  const r = Router();

  r.get('/excise', async (_req, res) => {
    const token = res.locals.auth.token;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    res.json({ enrollments: await store.list(token, farm.id) });
  });

  r.put('/excise/:schemeId/:year', async (req, res) => {
    const parsed = SetExciseEnrollmentInputSchema.safeParse({ ...req.body, schemeId: req.params.schemeId, year: req.params.year });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const refusal = exciseEnrollmentRefusal(data.excise, parsed.data);
    if (refusal) {
      res.status(refusal === 'unknown_scheme' ? 404 : 409).json({ error: refusal });
      return;
    }
    const token = res.locals.auth.token;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    try {
      res.json({ enrollment: await store.set(token, farm.id, parsed.data) });
    } catch (err) {
      if (!(err instanceof ExciseRefused)) throw err;
      res.status(403).json({ error: 'read_only' });
    }
  });

  return r;
}
