import { Router, type Response } from 'express';
import { AddEmployeeInputSchema, ArchiveEmployeeInputSchema, SetOwnFieldWorkInputSchema, UpdateEmployeeInputSchema, employeeRow } from '@cropcash/shared';
import { EmployeesError, type EmployeeStore } from '../db/employees';
import type { Repo } from '../db/repo';

/**
 * The farm's people (docs/employees-arenda-plan.md §1). Add, change, archive; never delete, so old salary
 * expenses keep their name. All of it acts as the farmer, so RLS decides what they may see and change.
 */
export function employeesRouter(repo: Repo, store: EmployeeStore, now: () => Date): Router {
  const r = Router();

  const fail = (res: Response, err: unknown) => {
    if (!(err instanceof EmployeesError)) throw err;
    res.status(err.status).json({ error: err.code });
  };

  r.post('/employees', async (req, res) => {
    const parsed = AddEmployeeInputSchema.safeParse(req.body);
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
    try {
      const id = await store.add(token, farm.id, employeeRow(parsed.data), parsed.data.clientId);
      res.status(201).json({ id });
    } catch (err) {
      fail(res, err);
    }
  });

  r.put('/employees/:id', async (req, res) => {
    const parsed = UpdateEmployeeInputSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const found = await store.update(res.locals.auth.token, parsed.data.id, employeeRow(parsed.data));
      if (found) res.status(204).end();
      else res.status(404).json({ error: 'not_found' });
    } catch (err) {
      fail(res, err);
    }
  });

  r.post('/employees/:id/archive', async (req, res) => {
    const parsed = ArchiveEmployeeInputSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const found = await store.archive(res.locals.auth.token, parsed.data.id, parsed.data.endsOn, now());
      if (found) res.status(204).end();
      else res.status(404).json({ error: 'not_found' });
    } catch (err) {
      fail(res, err);
    }
  });

  /** „Lucrările pe câmp le fac oamenii tăi?” (D3). Yes asks for the farmer's own cost per ha on Recolte. */
  r.put('/farm/own-field-work', async (req, res) => {
    const parsed = SetOwnFieldWorkInputSchema.safeParse(req.body);
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
    try {
      await store.setOwnFieldWork(token, farm.id, parsed.data.ownFieldWork);
      res.status(204).end();
    } catch (err) {
      fail(res, err);
    }
  });

  return r;
}
