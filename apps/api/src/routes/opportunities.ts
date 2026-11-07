import { Router } from 'express';
import { z } from 'zod';
import type { Repo } from '../db/repo';

const FollowSchema = z.strictObject({ key: z.string().min(1).max(300) });

/** Puts a funding call in the farmer's calendar, or takes it out. */
export function opportunitiesRouter(repo: Repo): Router {
  const r = Router();

  r.post('/opportunities/follow', async (req, res) => {
    const parsed = FollowSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const deadline = await repo.opportunityDeadline(token, parsed.data.key);
    if (deadline === undefined) {
      res.status(404).json({ error: 'unknown_opportunity' });
      return;
    }
    // A calendar entry needs a date. Some calls don't publish one yet.
    if (deadline === null) {
      res.status(409).json({ error: 'no_deadline' });
      return;
    }
    await repo.followOpportunity(token, farm.id, parsed.data.key);
    res.status(201).json({ ok: true });
  });

  r.post('/opportunities/unfollow', async (req, res) => {
    const parsed = FollowSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    await repo.unfollowOpportunity(res.locals.auth.token, parsed.data.key);
    res.json({ ok: true });
  });

  return r;
}
