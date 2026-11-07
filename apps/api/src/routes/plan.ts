import { Router } from 'express';
import { CreditInputSchema, EnvelopesInputSchema, leiToBani } from '@cropcash/shared';
import { RepoError, type Repo } from '../db/repo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Step 5: declared credits (decision C) and the envelope split. */
export function planRouter(repo: Repo): Router {
  const r = Router();

  r.post('/credits', async (req, res) => {
    const parsed = CreditInputSchema.safeParse(req.body);
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
    const c = parsed.data;
    const groupId = await repo.addCredit(token, farm.id, {
      amountBani: leiToBani(c.amountLei),
      takeDate: `${c.takeMonth}-01`,
      repayDate: `${c.repayMonth}-01`,
    });
    res.status(201).json({ groupId });
  });

  r.delete('/credits/:groupId', async (req, res) => {
    if (!UUID.test(req.params.groupId)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const deleted = await repo.deleteCredit(res.locals.auth.token, req.params.groupId);
    res.status(deleted ? 204 : 404).end();
  });

  r.put('/envelopes', async (req, res) => {
    const parsed = EnvelopesInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      await repo.setEnvelopes(res.locals.auth.token, parsed.data);
      res.status(204).end();
    } catch (err) {
      if (err instanceof RepoError && (err.code === 'invalid' || err.code === 'not_found')) {
        res.status(err.code === 'invalid' ? 400 : 404).json({ error: err.code === 'invalid' ? 'too_much' : 'no_farm' });
        return;
      }
      throw err;
    }
  });

  return r;
}
