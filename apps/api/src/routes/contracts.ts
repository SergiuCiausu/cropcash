import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import {
  AddFarmContractInputSchema,
  AddPartyInputSchema,
  ArchiveFarmContractInputSchema,
  DecideContractInputSchema,
  SetTaxProfileInputSchema,
  UpdateFarmContractInputSchema,
  UpdatePartyInputSchema,
  contractPaymentRow,
  farmContractRow,
  partyRow,
  type AppData,
} from '@cropcash/shared';
import { ContractError, type ContractStore } from '../db/contracts';
import type { Repo } from '../db/repo';

/**
 * The farm's contracts other than arendă, their parties and schedules, and the decision about a contract's end
 * (docs/contracts-plan.md §2, §3.2). Add, change, archive; never delete. All of it acts as the farmer, so RLS
 * decides what they may see and change (owner and manager write; the accountant only reads).
 */
export function contractsRouter(repo: Repo, store: ContractStore, data: Pick<AppData, 'contractTypes'>, now: () => Date): Router {
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
        if (!(err instanceof ContractError)) throw err;
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
    '/parties',
    handle(AddPartyInputSchema, async ({ clientId, ...input }, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (farm) res.status(201).json({ id: await store.addParty(token, farm.id, partyRow(input), clientId) });
    }),
  );
  r.put(
    '/parties/:id',
    handle(UpdatePartyInputSchema, async ({ id, ...input }, token, _req, res) => {
      found(res, await store.updateParty(token, id, partyRow(input)));
    }),
  );
  r.post(
    '/parties/:id/archive',
    handle(ArchiveFarmContractInputSchema, async ({ id }, token, _req, res) => {
      found(res, await store.archiveParty(token, id, now()));
    }),
  );

  r.post(
    '/contracts',
    handle(AddFarmContractInputSchema, async ({ clientId, ...input }, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (!farm) return;
      const id = await store.addContract(token, farm.id, farmContractRow(input, data.contractTypes), input.payments.map(contractPaymentRow), clientId);
      res.status(201).json({ id });
    }),
  );
  r.put(
    '/contracts/:id',
    handle(UpdateFarmContractInputSchema, async ({ id, ...input }, token, _req, res) => {
      found(res, await store.updateContract(token, id, farmContractRow(input, data.contractTypes), input.payments.map(contractPaymentRow)));
    }),
  );
  r.post(
    '/contracts/:id/archive',
    handle(ArchiveFarmContractInputSchema, async ({ id }, token, _req, res) => {
      found(res, await store.archiveContract(token, id, now()));
    }),
  );
  /** „Am hotărât”, for a contract or an arendă (`source`). It only notes a decision, so the phone may queue it. */
  r.post(
    '/contracts/:id/decide',
    handle(DecideContractInputSchema, async ({ id, source, decision, decidedOn }, token, _req, res) => {
      found(res, await store.decide(token, source, id, decision, decidedOn));
    }),
  );
  /** „Ce fel de fermă ești?” on the Taxe tab: what the contracts' VAT and micro tax rest on. */
  r.put(
    '/farm/tax-profile',
    handle(SetTaxProfileInputSchema, async ({ legalForm, vatStatus, micro }, token, _req, res) => {
      const farm = await farmOf(token, res);
      if (!farm) return;
      await store.setTaxProfile(token, farm.id, { legalForm, vatStatus, micro });
      res.status(204).end();
    }),
  );

  return r;
}
