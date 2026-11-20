/* Asks APIA's public LPIS service (docs/data/lpis.json) and keeps the answers on disk, so a bloc is
   fetched once a month at most and the map works when APIA is slow or down for a known bloc
   (docs/harta-plan.md, step 4). The tables of step 1b (lpis_blocs) will answer first once they exist:
   they implement the same LpisSource. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fbidOf,
  lpisQueries,
  parseBlocs,
  parseCommunes,
  parseExtentCentre,
  type LpisBloc,
  type LpisCommune,
  type LpisTile,
  type Position,
} from '@cropcash/shared';

/** APIA didn't answer, or answered something we can't read. Never cached. */
export class LpisUnavailable extends Error {}

export interface LpisSource {
  /** Null when APIA has no such bloc. */
  bloc(siruta: number, bloc: string): Promise<LpisBloc | null>;
  /** The blocs under a point (usually one; none outside farmland). */
  at(point: Position): Promise<LpisBloc[]>;
  /** The UATs of a county (TR, CT…), by name. */
  communes(county: string): Promise<LpisCommune[]>;
  /** The middle of a UAT's blocs, or null when it has none. */
  communeCentre(siruta: number): Promise<Position | null>;
  /** The blocs in one square of the map's grid (lpis-tiles.ts), for „Blocuri APIA”. */
  tile(t: LpisTile): Promise<LpisBloc[]>;
}

export interface LpisClientOptions {
  serviceUrl: string;
  /** Defaults to LPIS_CACHE_DIR, else a folder in the system temp dir. */
  cacheDir?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** An answer is kept 30 days; "no such bloc" one day, in case it was a typo APIA fixes. */
const KEEP_FOUND = 30 * DAY;
const KEEP_EMPTY = DAY;

export function lpisClient({ serviceUrl, cacheDir = process.env.LPIS_CACHE_DIR || join(tmpdir(), 'cropcash-lpis'), fetchFn = fetch, now = Date.now, timeoutMs = 10_000 }: LpisClientOptions): LpisSource {
  const q = lpisQueries(serviceUrl);
  const running = new Map<string, Promise<unknown>>();
  const fileOf = (url: string) => join(cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);

  async function cached(url: string): Promise<{ body: unknown; fresh: boolean } | null> {
    try {
      const { at, keep, body } = JSON.parse(await readFile(fileOf(url), 'utf8')) as { at: number; keep: number; body: unknown };
      return { body, fresh: now() - at < keep };
    } catch {
      return null;
    }
  }

  async function store(url: string, body: unknown, keep: number) {
    try {
      await mkdir(cacheDir, { recursive: true });
      const file = fileOf(url);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ at: now(), keep, body }));
      await rename(tmp, file);
    } catch (err) {
      console.warn('[lpis] cache write failed', err);
    }
  }

  /**
   * The answer to `url`, read with `parse`. A fresh cached answer is used as is; a stale one only when
   * APIA fails, because an old outline beats none. `isEmpty` decides how long an answer is kept.
   */
  function ask<T>(url: string, parse: (body: unknown) => T, isEmpty: (value: T) => boolean): Promise<T> {
    const inFlight = running.get(url);
    if (inFlight) return inFlight as Promise<T>;
    const job = (async () => {
      const kept = await cached(url);
      if (kept?.fresh) return parse(kept.body);
      try {
        const res = await fetchFn(url, { headers: { 'User-Agent': 'CropCash/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new LpisUnavailable(`APIA answered ${res.status}`);
        const body: unknown = await res.json();
        // ArcGIS reports errors with HTTP 200.
        if (body && typeof body === 'object' && 'error' in body) throw new LpisUnavailable('APIA answered an error');
        const value = parse(body);
        await store(url, body, isEmpty(value) ? KEEP_EMPTY : KEEP_FOUND);
        return value;
      } catch (err) {
        if (kept) return parse(kept.body);
        throw err instanceof LpisUnavailable ? err : new LpisUnavailable(err instanceof Error ? err.message : 'APIA failed');
      }
    })().finally(() => running.delete(url));
    running.set(url, job);
    return job;
  }

  return {
    async bloc(siruta, bloc) {
      const fbid = fbidOf(siruta, bloc);
      const found = await ask(q.bloc(fbid), parseBlocs, (b) => b.length === 0);
      return found.find((b) => b.fbid === fbid) ?? null;
    },
    at(point) {
      return ask(q.at(point), parseBlocs, (b) => b.length === 0);
    },
    communes(county) {
      return ask(q.communes(county), parseCommunes, (c) => c.length === 0);
    },
    communeCentre(siruta) {
      return ask(q.communeExtent(siruta), parseExtentCentre, (c) => c === null);
    },
    tile(t) {
      return ask(q.tile(t), parseBlocs, (b) => b.length === 0);
    },
  };
}
