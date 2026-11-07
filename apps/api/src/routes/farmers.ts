import { Router } from 'express';
import {
  ApiaDecisionSchema,
  HarvestsInputSchema,
  OnboardingInputSchema,
  UpdateFarmInputSchema,
  birthYearFromAge,
  computeSubsidies,
  farmInputFromStored,
  farmSubsidies,
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

export function farmersRouter(repo: Repo, data: AppData, params: SubsidyParams): Router {
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

  /** Replaces the farm's harvest years, closed crops and gathered grain. */
  r.put('/farmers/me/harvests', async (req, res) => {
    const parsed = HarvestsInputSchema.safeParse(req.body);
    if (!parsed.success) {
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
    await repo.setHarvests(token, farm.id, parsed.data);
    res.json({ harvests: parsed.data });
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
