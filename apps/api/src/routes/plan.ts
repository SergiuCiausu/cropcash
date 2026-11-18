import { Router } from 'express';
import {
  computeFarmPlan,
  CreditInputSchema,
  EnvelopesInputSchema,
  leiToBani,
  SetPensionFundInputSchema,
  type AppData,
} from '@cropcash/shared';
import { RepoError, type Repo } from '../db/repo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Step 5: declared credits (decision C) and the envelope split. */
export function planRouter(repo: Repo, data: AppData): Router {
  const r = Router();

  /**
   * Step 9: accepting the split or changing a credit fixes the monthly salary at what is
   * safe right now (docs/08 §1c). Payouts never go above it.
   */
  const fixSalary = async (token: string) => {
    const farm = await repo.getMyFarm(token);
    if (farm) await repo.setSalary(token, farm.id, computeFarmPlan(farm, data).salary.salary);
  };

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
      ...(c.groupId ? { groupId: c.groupId } : {}),
    });
    await fixSalary(token);
    res.status(201).json({ groupId });
  });

  r.delete('/credits/:groupId', async (req, res) => {
    if (!UUID.test(req.params.groupId)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    // A credit already received (demo) is money on hand: it can't be undeclared.
    const farm = await repo.getMyFarm(res.locals.auth.token);
    const ids = new Set((farm?.expected_payments ?? []).filter((p) => p.group_id === req.params.groupId).map((p) => p.id));
    if ((farm?.transactions ?? []).some((t) => t.expected_payment_id && ids.has(t.expected_payment_id))) {
      res.status(409).json({ error: 'credit_received' });
      return;
    }
    const deleted = await repo.deleteCredit(res.locals.auth.token, req.params.groupId);
    if (deleted) await fixSalary(res.locals.auth.token);
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
      await fixSalary(res.locals.auth.token);
      res.status(204).end();
    } catch (err) {
      if (err instanceof RepoError && (err.code === 'invalid' || err.code === 'not_found')) {
        res.status(err.code === 'invalid' ? 400 : 404).json({ error: err.code === 'invalid' ? 'too_much' : 'no_farm' });
        return;
      }
      throw err;
    }
  });

  /** Saves the chosen fund. No money moves, and the list is checked by the schema. */
  r.put('/pension/fund', async (req, res) => {
    const parsed = SetPensionFundInputSchema.safeParse(req.body);
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
    await repo.setPensionFund(token, farm.id, parsed.data.fundId);
    res.status(204).end();
  });

  return r;
}
