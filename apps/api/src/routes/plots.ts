import { Router, type Response } from 'express';
import {
  HarvestYearSchema,
  OperationInputSchema,
  OperationPatchSchema,
  SavePlotsInputSchema,
  UpdatePlotInputSchema,
  loadPlotsParams,
  operationToRow,
  plotToRow,
} from '@cropcash/shared';
import { PlotsError, type PlotStore } from '../db/plots';
import { ReplayCache, requestKey } from '../replay-cache';

/**
 * Parcels on the map (docs/harta-plan.md, step 3). All of it acts as the farmer, so RLS decides what
 * they may see and change. Writes need the internet: the phone doesn't queue them yet.
 */
export function plotsRouter(store: PlotStore): Router {
  const r = Router();
  const segments = loadPlotsParams().curve_segments.value;
  /* A save sent twice (a tap after a 502) gets the first answer instead of making a parcel twice. */
  const saves = new ReplayCache<string[]>(10 * 60_000);

  const fail = (res: Response, err: unknown) => {
    if (!(err instanceof PlotsError)) throw err;
    res.status(err.status).json({ error: err.code });
  };

  r.get('/plots', async (req, res) => {
    const year = req.query.year === undefined ? undefined : HarvestYearSchema.safeParse(Number(req.query.year));
    if (year && !year.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      res.json(await store.list(res.locals.auth.token, year?.data));
    } catch (err) {
      fail(res, err);
    }
  });

  /** The parcels from the review sheet, or any batch. Several parcels in one transaction. */
  r.put('/plots', async (req, res) => {
    const parsed = SavePlotsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { token, userId } = res.locals.auth;
    const { harvestYear, plots } = parsed.data;
    const rows = plots.map((p) => plotToRow(p, segments));
    const key = req.header('Idempotency-Key');
    try {
      const save = () => store.save(token, harvestYear, rows);
      const ids = key ? await saves.run(requestKey(userId, key, req.body), save) : await save();
      res.json({ ids });
    } catch (err) {
      fail(res, err);
    }
  });

  /** One parcel: its name, its outline, or its season that year. Keys left out stay as saved. */
  r.put('/plots/:id', async (req, res) => {
    const parsed = UpdatePlotInputSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { id, harvestYear, plot } = parsed.data;
    try {
      await store.save(res.locals.auth.token, harvestYear, [plotToRow({ ...plot, id }, segments)]);
      res.json({ id });
    } catch (err) {
      fail(res, err);
    }
  });

  r.post('/plots/operations', async (req, res) => {
    const parsed = OperationInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const id = await store.addOperation(res.locals.auth.token, operationToRow(parsed.data));
      res.status(201).json({ id });
    } catch (err) {
      fail(res, err);
    }
  });

  r.put('/plots/operations/:id', async (req, res) => {
    const parsed = OperationPatchSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { id, ...patch } = parsed.data;
    const row = operationToRow(patch);
    if (Object.keys(row).length === 0) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      await store.updateOperation(res.locals.auth.token, id, row);
      res.json({ id });
    } catch (err) {
      fail(res, err);
    }
  });

  r.delete('/plots/operations/:id', async (req, res) => {
    if (!OperationPatchSchema.safeParse({ id: req.params.id }).success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const removed = await store.removeOperation(res.locals.auth.token, req.params.id);
      res.status(removed ? 204 : 404).end();
    } catch (err) {
      fail(res, err);
    }
  });

  return r;
}
