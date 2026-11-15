import { Router, type Response } from 'express';
import { z } from 'zod';
import { blocPlace, isLpisCounty, placesTrCt, searchCommunes, type LpisBloc } from '@cropcash/shared';
import { LpisUnavailable, type LpisSource } from '../lpis/client';

/** Romania with a margin: a point outside it can't be on a bloc, so APIA isn't asked. */
const Lng = z.coerce.number().min(20).max(30);
const Lat = z.coerce.number().min(43.5).max(48.5);
const Siruta = z.coerce.number().int().positive().max(999_999);
/** As readPaperPlots tidies it: no spaces, no leading zeros. */
const Bloc = z.string().transform((s) => s.replace(/\s/g, '').replace(/^0+(?=\w)/, '')).pipe(z.string().regex(/^[0-9A-Za-z/]{1,20}$/));

/**
 * Finding parcels on the map (docs/harta-plan.md, step 4): a bloc by its number, the bloc under a
 * point, and the UATs of a county. Signed in only, so the app isn't an open proxy to APIA.
 */
export function lpisRouter(source: LpisSource): Router {
  const r = Router();

  const unavailable = (res: Response, err: unknown) => {
    if (!(err instanceof LpisUnavailable)) throw err;
    console.warn('[lpis]', err.message);
    res.status(503).json({ error: 'lpis_unavailable' });
  };
  const bad = (res: Response) => res.status(400).json({ error: 'invalid_input' });
  /** Each bloc with where it is: village, commune, county and how the village was found (step 1b). */
  const withPlace = (b: LpisBloc) => ({ ...b, place: blocPlace(b, placesTrCt()) });

  r.get('/lpis/bloc', async (req, res) => {
    const siruta = Siruta.safeParse(req.query.siruta);
    const bloc = Bloc.safeParse(req.query.bloc);
    if (!siruta.success || !bloc.success) return void bad(res);
    try {
      const found = await source.bloc(siruta.data, bloc.data);
      if (!found) return void res.status(404).json({ error: 'not_found' });
      res.json({ bloc: withPlace(found) });
    } catch (err) {
      unavailable(res, err);
    }
  });

  r.get('/lpis/at', async (req, res) => {
    const lng = Lng.safeParse(req.query.lng);
    const lat = Lat.safeParse(req.query.lat);
    if (!lng.success || !lat.success) return void bad(res);
    try {
      res.json({ blocs: (await source.at([lng.data, lat.data])).map(withPlace) });
    } catch (err) {
      unavailable(res, err);
    }
  });

  /** The UATs of a county, all of them or those matching `q`, without minding diacritics. */
  r.get('/siruta', async (req, res) => {
    const county = typeof req.query.county === 'string' ? req.query.county.toUpperCase() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
    if (!isLpisCounty(county)) return void bad(res);
    try {
      const all = await source.communes(county);
      res.json({ communes: q ? searchCommunes(all, q) : all });
    } catch (err) {
      unavailable(res, err);
    }
  });

  r.get('/siruta/:siruta/centre', async (req, res) => {
    const siruta = Siruta.safeParse(req.params.siruta);
    if (!siruta.success) return void bad(res);
    try {
      const centre = await source.communeCentre(siruta.data);
      if (!centre) return void res.status(404).json({ error: 'not_found' });
      res.json({ centre });
    } catch (err) {
      unavailable(res, err);
    }
  });

  return r;
}
