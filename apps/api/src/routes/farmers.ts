import { Router } from 'express';
import {
  ApiaDecisionSchema,
  HarvestsInputSchema,
  OnboardingInputSchema,
  SetCropCostInputSchema,
  UpdateFarmInputSchema,
  birthYearFromAge,
  computeSubsidies,
  farmInputFromStored,
  farmSubsidies,
  farmToday,
  finishedCost,
  harvestYear,
  isOwnCrop,
  storedHarvestCosts,
  todayInRomania,
  withCropCost,
  withOwnCrops,
  haToAri,
  leiToBani,
  validateHarvests,
  validateOnboarding,
  type AppData,
  type OnboardingParsed,
  type SubsidyParams,
} from '@cropcash/shared';
import { RepoError, type Repo } from '../db/repo';

export function farmersRouter(repo: Repo, data: AppData, params: SubsidyParams, now: () => Date): Router {
  const r = Router();
  const year = data.subsidies.meta.campaign_year;
  const storedParcel = (p: OnboardingParsed['parcels'][number]) => ({
    cropId: p.cropId,
    areaAri: haToAri(p.areaHa),
    plantedMonth: p.plantedMonth,
  });

  r.get('/me', async (_req, res) => {
    const { userId, token } = res.locals.auth;
    const farmer = await repo.getMyFarm(token);
    res.json({ userId, farmer });
  });

  /** Onboarding: creates the farm, parcels and envelopes; returns the subsidy estimate. */
  r.post('/farmers', async (req, res) => {
    const parsed = OnboardingInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues.map((i) => i.path.join('.')) });
      return;
    }
    const input = parsed.data;
    const issues = validateOnboarding(input, data);
    if (issues.length) {
      res.status(400).json({ error: 'invalid_input', issues });
      return;
    }

    const { token } = res.locals.auth;
    try {
      const farmerId = await repo.createFarm(token, {
        name: input.name,
        county: input.county,
        birthYear: birthYearFromAge(input.age, year),
        startBalanceBani: leiToBani(input.startBalanceLei),
        parcels: input.parcels.map(storedParcel),
      });
      const farm = await repo.getMyFarm(token);
      res.status(201).json({
        farmerId,
        subsidies: farm ? computeSubsidies(farmInputFromStored(farm, year), data, params) : null,
      });
    } catch (err) {
      if (err instanceof RepoError && err.code === 'conflict') {
        res.status(409).json({ error: 'farm_exists' });
        return;
      }
      throw err;
    }
  });

  /** Replaces the farm's details and parcels; returns the new subsidy estimate. */
  r.put('/farmers/me', async (req, res) => {
    const parsed = UpdateFarmInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const input = parsed.data;
    const { token } = res.locals.auth;
    const before = await repo.getMyFarm(token);
    const issues = validateOnboarding(input, withOwnCrops(data, before?.harvests?.ownCrops));
    if (issues.length) {
      res.status(400).json({ error: 'invalid_input', issues });
      return;
    }
    try {
      await repo.updateFarm(token, {
        name: input.name,
        county: input.county,
        birthYear: birthYearFromAge(input.age, year),
        startBalanceBani: leiToBani(input.startBalanceLei),
        parcels: input.parcels.map(storedParcel),
      });
      const farm = await repo.getMyFarm(token);
      res.json({ subsidies: farm ? farmSubsidies(farm, data, params) : null });
    } catch (err) {
      if (err instanceof RepoError && (err.code === 'invalid' || err.code === 'not_found')) {
        res.status(err.code === 'invalid' ? 400 : 404).json({ error: err.code === 'invalid' ? 'too_much' : 'no_farm' });
        return;
      }
      throw err;
    }
  });

  /**
   * Replaces the farm's harvest years, closed crops and gathered grain. The phone sends the version
   * its copy had in If-Match; a save made on an older copy gets 409 changed_elsewhere instead of
   * overwriting the newer one (IDEM-12). Without If-Match (older builds) it saves on the version
   * read here, so only a save racing it loses.
   */
  r.put('/farmers/me/harvests', async (req, res) => {
    const parsed = HarvestsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const ifMatch = req.header('If-Match');
    if (ifMatch !== undefined && !/^"?\d{1,9}"?$/.test(ifMatch.trim())) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const issues = validateHarvests(parsed.data, data);
    if (issues.length) {
      res.status(400).json({ error: 'invalid_input', issues });
      return;
    }
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const base = ifMatch !== undefined ? Number(ifMatch.trim().replace(/"/g, '')) : (farm.harvests_version ?? 0);
    try {
      const version = await repo.setHarvests(token, farm.id, parsed.data, base);
      res.json({ harvests: parsed.data, version });
    } catch (err) {
      if (err instanceof RepoError && err.code === 'conflict') {
        res.status(409).json({ error: 'changed_elsewhere', version: farm.harvests_version ?? 0 });
        return;
      }
      throw err;
    }
  });

  /**
   * Changes one crop's cost and nothing else, for the assistant's card, which has no copy of the
   * whole document to send. A figure "from the expenses" is worked out here, never taken from the
   * phone or the model. It doesn't touch a fixed salary: a higher cost lowers what's paid through
   * the plan when the money wouldn't last, and an estimate doesn't raise real payouts.
   */
  r.put('/farmers/me/crop-cost', async (req, res) => {
    const parsed = SetCropCostInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { cropId, costLeiPerHa, fromHarvestYear } = parsed.data;
    const { token } = res.locals.auth;
    // Saved on the version just read, so a change made meanwhile on another phone isn't overwritten.
    for (let attempt = 0; ; attempt++) {
      const farm = await repo.getMyFarm(token);
      if (!farm) {
        res.status(404).json({ error: 'no_farm' });
        return;
      }
      const onFarm = farm.parcels.some((p) => p.crop_id === cropId) || !!farm.harvests?.years.some((y) => y.parcels.some((p) => p.cropId === cropId));
      if (!data.crops.crops.some((c) => c.id === cropId) || !onFarm) {
        res.status(400).json({ error: 'invalid_input', issues: [isOwnCrop(cropId) ? 'own_crop' : 'unknown_crop'] });
        return;
      }
      const today = farmToday(farm, todayInRomania(now()));
      const cost = fromHarvestYear === undefined ? costLeiPerHa! : finishedCost(storedHarvestCosts(farm, data, today), cropId, fromHarvestYear);
      if (fromHarvestYear !== undefined && cost === null) {
        res.status(409).json({ error: 'cost_not_ready' });
        return;
      }
      const doc = farm.harvests ?? {
        years: [{ year: harvestYear(today), status: 'open' as const, openingBani: farm.start_balance_bani ?? 0, parcels: farm.parcels.map((p) => ({ cropId: p.crop_id, areaHa: p.area_ari / 100 })) }],
        gathered: [],
      };
      const next = withCropCost(doc, cropId, cost);
      try {
        const version = await repo.setHarvests(token, farm.id, next, farm.harvests_version ?? 0);
        res.json({ costLeiPerHa: cost, version });
        return;
      } catch (err) {
        if (!(err instanceof RepoError && err.code === 'conflict')) throw err;
        if (attempt > 0) {
          res.status(409).json({ error: 'changed_elsewhere', version: farm.harvests_version ?? 0 });
          return;
        }
      }
    }
  });

  /** The current user's subsidy estimate (min / probable / max, advance and balance). */
  r.get('/subsidies', async (_req, res) => {
    const farm = await repo.getMyFarm(res.locals.auth.token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    res.json(farmSubsidies(farm, data, params));
  });

  /** The total on the payment decision. Expected money only: nothing here records a payment. */
  r.put('/farmers/me/apia-decision', async (req, res) => {
    const parsed = ApiaDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (parsed.data.campaignYear !== year) {
      res.status(400).json({ error: 'wrong_year' });
      return;
    }
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    await repo.setApiaDecision(token, farm.id, parsed.data);
    res.status(204).end();
  });

  r.delete('/farmers/me/apia-decision', async (_req, res) => {
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    await repo.setApiaDecision(token, farm.id, null);
    res.status(204).end();
  });

  return r;
}
