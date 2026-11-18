import express, { Router, type Response } from 'express';
import { PileInputSchema, type AppData } from '@cropcash/shared';
import type { Repo } from '../db/repo';
import { requireAuth, type TokenVerifier } from '../middleware/auth';
import { pickFarm } from '../middleware/farm';
import type { PileJobs } from '../piles/jobs';
import { paperBodyErrors } from './documents';

const BASE64_GROWTH = 4 / 3;
const ROOM_FOR_THE_JSON_MB = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = { bad_file: 400, too_large: 413, too_many_pages: 413, too_many_piles: 429 } as const;

interface PilesDeps {
  verifyToken: TokenVerifier;
  jobs: PileJobs;
  repo: Pick<Repo, 'farmIdFor' | 'myRole'>;
  data: AppData;
}

/**
 * A pile of papers uploaded at once (docs/apia-documents-autofill-plan.md §3.1, step 4). POST answers 202 with the
 * pile's id and works in the background; GET says how far it got and which papers it found. Owner and manager only,
 * like the kept cerere. Mounted before the app's small JSON parser: a pile is the whole APIA folder.
 */
export function pilesRouter({ verifyToken, jobs, repo, data }: PilesDeps): Router {
  const r = Router();
  const auth = [requireAuth(verifyToken), pickFarm()];
  const big = express.json({ limit: `${Math.ceil(data.params.documents.pile_max_mb.value * BASE64_GROWTH) + ROOM_FOR_THE_JSON_MB}mb` });

  async function farmFor(res: Response): Promise<string | null> {
    const { token } = res.locals.auth;
    const farmId = await repo.farmIdFor(token, res.locals.farmId);
    const role = farmId ? await repo.myRole(token, farmId) : null;
    if (!farmId || !role) {
      res.status(404).json({ error: 'no_farm' });
      return null;
    }
    if (role !== 'owner' && role !== 'manager') {
      res.status(403).json({ error: 'role_not_allowed' });
      return null;
    }
    return farmId;
  }

  r.post('/piles', ...auth, big, async (req, res) => {
    const parsed = PileInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const farmId = await farmFor(res);
    if (!farmId) return;
    const { userId, token } = res.locals.auth;
    const started = await jobs.start({ userId, token, farmId }, parsed.data);
    if (!started.ok) res.status(STATUS[started.error]).json({ error: started.error });
    else res.status(202).json({ id: started.id });
  });

  r.get('/piles/:id', ...auth, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const farmId = await farmFor(res);
    if (!farmId) return;
    const view = jobs.view(farmId, id);
    if (!view) res.status(404).json({ error: 'not_found' });
    else res.json(view);
  });

  r.use(paperBodyErrors);
  return r;
}
