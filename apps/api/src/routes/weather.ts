import { Router } from 'express';
import type { Repo } from '../db/repo';
import { WeatherUnavailableError, type WeatherService } from '../weather';

/** The forecast for the signed-in farmer's county. The county comes from the farm, never the client. */
export function weatherRouter(repo: Repo, weather: WeatherService): Router {
  const r = Router();

  r.get('/weather', async (_req, res) => {
    const farm = await repo.getMyFarm(res.locals.auth.token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    try {
      const forecast = await weather.get(farm.county);
      if (!forecast) {
        res.status(404).json({ error: 'unknown_county' });
        return;
      }
      res.json(forecast);
    } catch (err) {
      if (!(err instanceof WeatherUnavailableError)) throw err;
      res.status(503).json({ error: 'weather_unavailable' });
    }
  });

  return r;
}
