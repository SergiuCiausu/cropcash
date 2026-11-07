import { Router } from 'express';
import {
  ExpenseInputSchema,
  SaleInputSchema,
  TaskIdSchema,
  buildFarmPlan,
  farmToday,
  leiToBani,
  monthKey,
  proposeSplit,
  saleAmountBani,
  todayInRomania,
  type AppData,
  type SubsidyParams,
} from '@cropcash/shared';
import { RepoError, type Repo } from '../db/repo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the farmer records as it happens: sales, expenses and finished tasks. */
export function recordsRouter(repo: Repo, data: AppData, params: SubsidyParams, now: () => Date): Router {
  const r = Router();
  /* A farm's own crops count as known, for that farm only (P30). */
  const knownCrop = (id: string | undefined, farm: { harvests?: { ownCrops?: { id: string }[] } | null }) =>
    id === undefined || data.crops.crops.some((c) => c.id === id) || !!farm.harvests?.ownCrops?.some((c) => c.id === id);
  const todayFor = (farm: { demo_now?: string | null }) => farmToday(farm, todayInRomania(now()));
  const planFor = async (token: string) => {
    const farm = await repo.getMyFarm(token);
    return farm && buildFarmPlan(farm, data, { month: monthKey(todayFor(farm)), params });
  };

  r.post('/sales', async (req, res) => {
    const parsed = SaleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const sale = parsed.data;
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    if (!knownCrop(sale.cropId, farm)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (sale.date > todayFor(farm)) {
      res.status(400).json({ error: 'future_date' });
      return;
    }
    const amountBani = saleAmountBani(sale);
    const id = await repo.addSale(token, farm.id, { amountBani, date: sale.date, cropId: sale.cropId, harvestYear: sale.harvestYear, note: sale.note });
    const plan = await planFor(token);
    res.status(201).json({ id, split: plan && proposeSplit(plan, amountBani, true).split });
  });

  r.post('/expenses', async (req, res) => {
    const parsed = ExpenseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const expense = parsed.data;
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    if (!knownCrop(expense.cropId, farm)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (expense.date > todayFor(farm)) {
      res.status(400).json({ error: 'future_date' });
      return;
    }
    try {
      const id = await repo.addExpense(token, {
        amountBani: leiToBani(expense.amountLei),
        harvestYear: expense.harvestYear,
        date: expense.date,
        category: expense.category,
        cropId: expense.cropId,
        note: expense.note,
        envelope: expense.envelope,
      });
      const plan = await planFor(token);
      res.status(201).json({ id, salary: plan?.salary.salary ?? null });
    } catch (err) {
      if (err instanceof RepoError && err.code === 'not_found') {
        res.status(404).json({ error: 'no_farm' });
        return;
      }
      throw err;
    }
  });

  r.delete('/transactions/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const undone = await repo.undoTransaction(res.locals.auth.token, req.params.id);
    res.status(undone ? 204 : 404).end();
  });

  const taskId = (raw: string) => {
    const parsed = TaskIdSchema.safeParse(raw);
    if (!parsed.success) return null;
    return data.calendar.events.some((e) => e.id === parsed.data.split(':')[0]) ? parsed.data : null;
  };

  r.put('/tasks/:id', async (req, res) => {
    const id = taskId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    await repo.completeTask(token, farm.id, id);
    res.status(204).end();
  });

  r.delete('/tasks/:id', async (req, res) => {
    const id = taskId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const reopened = await repo.reopenTask(res.locals.auth.token, id);
    res.status(reopened ? 204 : 404).end();
  });

  return r;
}
