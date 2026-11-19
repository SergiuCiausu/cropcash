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
  CONTRACTS_ROLES,
  contractPaymentRow,
  farmContractRow,
  farmContractsSummary,
  farmToday,
  partyRow,
  sumFarms,
  todayInRomania,
  type AppData,
  type ContractData,
  type CrossFarmSummary,
  type ContractsRole,
  type FarmContractsSummary,
} from '@cropcash/shared';
import { ContractError, type ContractStore } from '../db/contracts';
import type { Repo } from '../db/repo';

/**
 * The farm's contracts other than arendă, their parties and schedules, and the decision about a contract's end
 * (docs/contracts-plan.md §2, §3.2). Add, change, archive; never delete. All of it acts as the farmer, so RLS
 * decides what they may see and change (owner and manager write; the accountant only reads).
 */
export function contractsRouter(repo: Repo, store: ContractStore, data: Pick<AppData, 'contractTypes'> & ContractData, now: () => Date): Router {
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

  /**
   * „Toate fermele” (§6, step 7): the contracts of every farm I own, manage or keep the books for, each summed with
   * the same code as its Contracte header, then added up. No farm header: it's the one route that spans farms.
   * A worker's farms are left out. A farm that can't be read is named in `missing`, not guessed.
   */
  r.get('/farms/contracts-summary', async (_req, res) => {
    res.json(await allFarmsContracts(store, data, now, res.locals.auth.token as string));
  });

  return r;
}

/**
 * Every farm the farmer may see the contracts of (owner, manager, accountant; not a worker's), and the total. The
 * Contracte toggle and the assistant (get_contracts_all_farms) both use it. A farm that can't be read is named in
 * `missing`, not guessed.
 */
export async function allFarmsContracts(
  store: Pick<ContractStore, 'myFarms' | 'farmContracts'>,
  data: ContractData,
  now: () => Date,
  token: string,
): Promise<CrossFarmSummary & { missing: string[] }> {
  const mine = (await store.myFarms(token)).filter((f): f is typeof f & { role: ContractsRole } => (CONTRACTS_ROLES as readonly string[]).includes(f.role));
  const missing: string[] = [];
  const perFarm: FarmContractsSummary[] = [];
  for (const f of mine) {
    try {
      const got = await store.farmContracts(token, f.farmId);
      const contracts = { ...got.contracts, county: got.contracts.county ?? f.county };
      const today = farmToday({ demo_now: got.demoNow }, todayInRomania(now()));
      perFarm.push(farmContractsSummary({ farmId: f.farmId, name: f.name, role: f.role }, contracts, data, today, got.arenda));
    } catch (err) {
      console.error('contracts-summary: farm %s: %s', f.farmId, err instanceof Error ? err.message : err);
      missing.push(f.name);
    }
  }
  return { ...sumFarms(perFarm), missing };
}
