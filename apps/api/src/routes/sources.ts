import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppData } from '@cropcash/shared';
import type { NewPage, PageRead, PageReader } from 'subventii-monitor/pages';
import type { SourcesStore } from '../db/sources';

const KEY_HEADER = 'x-source-key';
const KEY = /^[A-Za-z0-9_-]{43}$/;
const MAX_LINK_CHARS = 2000;
const MAX_NAME_CHARS = 120;

const AddSchema = z.strictObject({
  url: z.string().min(1).max(MAX_LINK_CHARS),
  name: z.string().trim().max(MAX_NAME_CHARS).optional(),
});

export interface SourcesDeps {
  store: SourcesStore;
  read: PageReader;
  clean: (text: string) => string | null;
  /** The row to save for a finished read. */
  newPage: (read: Exclude<PageRead, { state: 'refused' }>, now: Date) => NewPage;
}

/** Counts per name and day. Kept in memory: a restart starts the day over, which only helps the farmer. */
class DailyLimit {
  private counts = new Map<string, number>();
  private day = '';

  constructor(private max: number) {}

  /** Counts one, unless the name has used up the day. */
  take(name: string, day: string): boolean {
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
    const used = this.counts.get(name) ?? 0;
    if (used >= this.max) return false;
    this.counts.set(name, used + 1);
    return true;
  }
}

/** The key is long and random, so a plain hash is enough to keep it out of the database. */
function ownerOf(req: Request, res: Response): string | null {
  const key = req.get(KEY_HEADER);
  if (key && KEY.test(key)) return createHash('sha256').update(key).digest('hex');
  res.status(400).json({ error: 'bad_key' });
  return null;
}

/** A farmer's own sources. No sign-in: the key in the browser is what makes them private. */
export function sourcesRouter({ store, read, clean, newPage }: SourcesDeps, data: AppData, now: () => Date): Router {
  const p = data.params.sources;
  const perKey = new DailyLimit(p.adds_per_day.value);
  const perIp = new DailyLimit(p.ip_adds_per_day.value);
  let reading = 0;
  const r = Router();

  r.get('/sources', async (req, res) => {
    const owner = ownerOf(req, res);
    if (owner) res.json({ sources: await store.list(owner) });
  });

  r.post('/sources', async (req, res) => {
    const owner = ownerOf(req, res);
    if (!owner) return;
    const parsed = AddSchema.safeParse(req.body);
    const url = parsed.success ? clean(parsed.data.url) : null;
    if (!parsed.success || !url) {
      res.status(400).json({ error: 'bad_link' });
      return;
    }

    const mine = await store.list(owner);
    const same = mine.find((s) => s.url === url);
    if (same) {
      res.json({ source: same, already: true });
      return;
    }
    if (mine.length >= p.farmer_max.value) {
      res.status(409).json({ error: 'too_many' });
      return;
    }
    const day = now().toISOString().slice(0, 10);
    if (!perIp.take(req.ip ?? 'unknown', day) || !perKey.take(owner, day)) {
      res.status(429).json({ error: 'too_many_today' });
      return;
    }

    let pageId = await store.pageId(url);
    if (pageId === null) {
      if ((await store.pageCount()) >= p.pages_max.value || reading >= p.reads_at_once.value) {
        res.status(503).json({ error: 'busy' });
        return;
      }
      reading += 1;
      let result: PageRead;
      try {
        result = await read(url);
      } finally {
        reading -= 1;
      }
      if (result.state === 'refused') {
        res.status(422).json({ error: result.reason });
        return;
      }
      pageId = await store.addPage(newPage(result, now()));
    }

    await store.attach(owner, pageId, parsed.data.name || null);
    const source = (await store.list(owner)).find((s) => s.url === url);
    res.status(201).json({ source });
  });

  r.delete('/sources/:id', async (req, res) => {
    const owner = ownerOf(req, res);
    if (!owner) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !(await store.remove(owner, id))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(204).end();
  });

  return r;
}
