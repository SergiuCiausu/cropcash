import { Router } from 'express';
import {
  OnboardingInputSchema,
  birthYearFromAge,
  computeSubsidies,
  farmInputFromStored,
  haToAri,
  validateOnboarding,
  type AppData,
  type SubsidyParams,
} from '@cropcash/shared';
import { RepoError, type Repo } from '../db/repo';

export function farmersRouter(repo: Repo, data: AppData, params: SubsidyParams): Router {
  const r = Router();
  const year = data.subsidies.meta.campaign_year;

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
        parcels: input.parcels.map((p) => ({ cropId: p.cropId, areaAri: haToAri(p.areaHa) })),
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

  /** The current user's subsidy estimate (min / probable / max, advance and balance). */
  r.get('/subsidies', async (_req, res) => {
    const farm = await repo.getMyFarm(res.locals.auth.token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    res.json(computeSubsidies(farmInputFromStored(farm, year), data, params));
  });

  return r;
}
