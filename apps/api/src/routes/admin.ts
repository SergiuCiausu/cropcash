import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  applyOverrides,
  FACTOR_GROUPS,
  formatPath,
  listFactors,
  OverrideError,
  OverrideSchema,
  parsePath,
  type Override,
} from '@cropcash/shared';
import { StaleVersion, type PredictionStore } from '../db/predictions';
import { isAdmin, requireAdmin } from '../middleware/admin';
import type { DataSource } from '../predictions/source';

/*
 * The admin panel's API (docs/admin-panel-plan.md, step 4). Everyone signed in reads the published
 * changes, because every forecast on the phone needs them; only an admin sees the panel and publishes.
 */

export interface PredictionDeps {
  store: PredictionStore;
  source: DataSource;
  /** Sign-in emails, lower case. */
  admins: readonly string[];
}

const PublishSchema = z.object({
  /** The version the panel was opened on. */
  baseVersion: z.number().int().min(0),
  note: z.string().trim().min(1).max(500),
  /** The whole set the new version holds (not a delta). Empty = back to the files as written. */
  overrides: z.array(OverrideSchema).max(500),
});

const RevertSchema = z.object({
  baseVersion: z.number().int().min(0),
  note: z.string().trim().min(1).max(500).optional(),
});

const HISTORY_SHOWN = 50;

/** Paths as the store keeps them, so "a.b[id=x].c" and a hand-typed variant are one path. */
const normalized = (overrides: Override[]): Override[] => overrides.map((o) => ({ ...o, path: formatPath(parsePath(o.path)) }));

const sameSet = (a: readonly Override[], b: readonly Override[]) => {
  const key = (os: readonly Override[]) => JSON.stringify([...os].map((o) => [o.path, o.value]).sort());
  return key(a) === key(b);
};

export function predictionsRouter({ store, source, admins }: PredictionDeps): Router {
  const r = Router();
  const admin = requireAdmin(admins);

  /** What the phone lays over its own copy of docs/data. Cheap: served from memory, with an ETag. */
  r.get('/prediction-data', (req, res) => {
    const you = isAdmin(admins, res.locals.auth.email);
    const etag = `"v${source.version()}${you ? 'a' : ''}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.header('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    res.json({ version: source.version(), overrides: source.overrides(), admin: you });
  });

  /** Every editable figure: its value in docs/data, the value in force and why. */
  r.get('/admin/factors', admin, (_req, res) => {
    const changed = new Map(source.overrides().map((o) => [o.path, o]));
    const factors = listFactors().map(({ path, factor, value }) => {
      const { pattern: _pattern, ...about } = factor;
      const o = changed.get(path);
      return { path, ...about, fileValue: value, value: o ? o.value : value, reason: o?.reason ?? null };
    });
    res.json({ version: source.version(), groups: FACTOR_GROUPS, factors, rejected: source.rejected() });
  });

  r.get('/admin/versions', admin, async (_req, res) => {
    res.json({ current: source.version(), versions: await store.history(HISTORY_SHOWN) });
  });

  r.get('/admin/versions/:version', admin, async (req, res) => {
    const n = Number(req.params.version);
    const found = Number.isInteger(n) && n > 0 ? await store.version(n) : null;
    if (!found) {
      res.status(404).json({ error: 'no_such_version' });
      return;
    }
    res.json(found);
  });

  /**
   * Checks the set against docs/data, then publishes it as one new version. A set that doesn't check
   * publishes nothing. 409 when someone published since the panel opened; `sameAsYours` tells a
   * retried tap (its own set is already in force) from a real clash.
   */
  const publish = async (
    res: Response,
    input: { baseVersion: number; note: string; overrides: Override[]; revertedFrom?: number },
  ) => {
    let overrides: Override[];
    try {
      overrides = normalized(input.overrides);
      applyOverrides(overrides);
    } catch (e) {
      if (!(e instanceof OverrideError)) throw e;
      res.status(400).json({ error: 'invalid_override', code: e.code, path: e.path, message: e.message });
      return;
    }
    try {
      const version = await store.publish({ ...input, overrides, by: res.locals.auth.userId });
      await source.refresh();
      res.status(201).json({ version });
    } catch (e) {
      if (!(e instanceof StaleVersion)) throw e;
      await source.refresh();
      res.status(409).json({ error: 'stale_version', current: source.version(), sameAsYours: sameSet(source.overrides(), overrides) });
    }
  };

  r.post('/admin/publish', admin, async (req, res) => {
    const parsed = PublishSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    await publish(res, parsed.data);
  });

  /** Puts an older version's set back in force, as a new version (history is never rewritten). */
  r.post('/admin/revert/:version', admin, async (req, res) => {
    const parsed = RevertSchema.safeParse(req.body);
    const n = Number(req.params.version);
    if (!parsed.success || !Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const old = await store.version(n);
    if (!old) {
      res.status(404).json({ error: 'no_such_version' });
      return;
    }
    await publish(res, {
      baseVersion: parsed.data.baseVersion,
      note: parsed.data.note ?? `Înapoi la versiunea ${n}`,
      overrides: old.overrides,
      revertedFrom: n,
    });
  });

  return r;
}
