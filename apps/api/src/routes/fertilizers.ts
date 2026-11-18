import { Router } from 'express';
import { NewFertilizerProductSchema, fertilizerProductId } from '@cropcash/shared';
import { CatalogueConflict, UnknownFertilizerType, type FertilizerStore } from '../db/fertilizers';

export interface FertilizerDeps {
  store: FertilizerStore;
  /** Who may add products, by sign-in email (lower case): the admins (ADMIN_EMAILS) plus CATALOGUE_EDITORS (env.ts). */
  editors: readonly string[];
}

/** The fertilizer catalogue: everyone signed in reads it, an editor adds to it. */
export function fertilizersRouter({ store, editors }: FertilizerDeps): Router {
  const r = Router();
  const canEdit = (email: string | undefined) => !!email && editors.includes(email.toLowerCase());

  r.get('/fertilizers', async (_req, res) => {
    const catalogue = await store.read();
    res.json({ ...catalogue, canEdit: canEdit(res.locals.auth.email) });
  });

  r.post('/fertilizers/products', async (req, res) => {
    if (!canEdit(res.locals.auth.email)) {
      res.status(403).json({ error: 'not_an_editor' });
      return;
    }
    const parsed = NewFertilizerProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const id = fertilizerProductId(parsed.data.manufacturer, parsed.data.brand);
    if (id.length < 2) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      await store.addProduct(id, parsed.data, res.locals.auth.userId);
    } catch (err) {
      if (err instanceof CatalogueConflict) {
        res.status(409).json({ error: 'already_exists', id });
        return;
      }
      if (err instanceof UnknownFertilizerType) {
        res.status(400).json({ error: 'unknown_type' });
        return;
      }
      throw err;
    }
    res.status(201).json({ id });
  });

  return r;
}
