import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import {
  AddContractInputSchema,
  AddLandownerInputSchema,
  ArchiveArendaInputSchema,
  SetLandownerCountInputSchema,
  SetPlotTenureInputSchema,
  UpdateContractInputSchema,
  UpdateLandownerInputSchema,
  contractRow,
  landownerRow,
} from '@cropcash/shared';
import { ArendaError, type ArendaStore } from '../db/arenda';
import type { Repo } from '../db/repo';

/**
 * Landowners, arendă contracts and a parcel's tenure (docs/employees-arenda-plan.md §3.1–3.2). Add, change,
 * archive; never delete, so old rent payments keep their name. All of it acts as the farmer, so RLS decides
 * what they may see and change.
 */
export function arendaRouter(repo: Repo, store: ArendaStore, now: () => Date): Router {
  const r = Router();

  /** Parses the body (plus the ids in the path), runs `act`, answers its errors. */
  function handle<S extends z.ZodType>(schema: S, act: (input: z.output<S>, token: string, req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
      const parsed = schema.safeParse({ ...req.body, ...req.params });
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      try {
        await act(parsed.data, res.locals.auth.token, req, res);
      } catch (err) {
        if (!(err instanceof ArendaError)) throw err;
        res.status(err.status).json({ error: err.code });
      }
    };
  }

  /** The farm, or a 404 already sent. */
  async function farmOf(token: string, res: Response) {
    const farm = await repo.getMyFarm(token);
    if (!farm) res.status(404).json({ error: 'no_farm' });
    return farm;
  }

  const found = (res: Response, ok: boolean) => (ok ? res.status(204).end() : res.status(404).json({ error: 'not_found' }));

  r.post(
    '/landowners',
    handle(AddLandownerInputSchema, async ({ clientId, ...input }, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (farm) res.status(201).json({ id: await store.addLandowner(token, farm.id, landownerRow(input), clientId) });
    }),
  );
  r.put(
    '/landowners/:id',
    handle(UpdateLandownerInputSchema, async ({ id, ...input }, token, _req, res) => {
      found(res, await store.updateLandowner(token, id, landownerRow(input)));
    }),
  );
  r.post(
    '/landowners/:id/archive',
    handle(ArchiveArendaInputSchema, async ({ id }, token, _req, res) => {
      found(res, await store.archiveLandowner(token, id, now()));
    }),
  );

  r.post(
    '/lease-contracts',
    handle(AddContractInputSchema, async (input, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (farm) res.status(201).json({ id: await store.addContract(token, farm.id, contractRow(input), input.clientId) });
    }),
  );
  r.put(
    '/lease-contracts/:id',
    handle(UpdateContractInputSchema, async (input, token, _req, res) => {
      found(res, await store.updateContract(token, input.id, contractRow(input)));
    }),
  );
  r.post(
    '/lease-contracts/:id/archive',
    handle(ArchiveArendaInputSchema, async ({ id }, token, _req, res) => {
      found(res, await store.archiveContract(token, id, now()));
    }),
  );

  r.put(
    '/plots/:plotId/tenure',
    handle(SetPlotTenureInputSchema, async ({ plotId, tenure }, token, _req, res) => {
      found(res, await store.setPlotTenure(token, plotId, tenure));
    }),
  );

  /** „Câți proprietari ai?” (onboarding, arendaș farms). */
  r.put(
    '/farm/landowner-count',
    handle(SetLandownerCountInputSchema, async ({ count }, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (!farm) return;
      await store.setLandownerCount(token, farm.id, count);
      res.status(204).end();
    }),
  );

  return r;
}
