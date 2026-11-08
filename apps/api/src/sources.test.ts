import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import type { NewPage, PageRead } from 'subventii-monitor/pages';
import { createApp } from './app';
import type { FarmerSource, SourcesStore } from './db/sources';
import type { Repo } from './db/repo';
import type { SourcesDeps } from './routes/sources';

const data = loadData();
const limits = data.params.sources;
const key = (c: string) => c.repeat(43);
const mine = { 'x-source-key': key('a') };
const yours = { 'x-source-key': key('b') };
const okRead: PageRead = {
  state: 'ok', url: 'https://afir.ro/x', finalUrl: 'https://afir.ro/x', kind: 'pagina', title: 'Titlu', text: 'text', hash: 'h',
};

/** The two tables, in memory. */
function memoryStore(): SourcesStore & { pages: NewPage[] } {
  const pages: NewPage[] = [];
  const rows: { id: number; owner: string; pageId: number; name: string | null }[] = [];
  let nextId = 1;
  const toSource = (r: (typeof rows)[number]): FarmerSource => {
    const p = pages[r.pageId - 1]!;
    return {
      id: r.id, name: r.name, url: p.url, title: p.title ?? null, kind: p.kind ?? null, state: p.state,
      preview: p.preview ?? null, checkedAt: p.checked_at, changedAt: null, shortDiff: null,
    };
  };
  return {
    pages,
    list: async (owner) => rows.filter((r) => r.owner === owner).map(toSource),
    pageId: async (url) => {
      const i = pages.findIndex((p) => p.url === url);
      return i < 0 ? null : i + 1;
    },
    pageCount: async () => pages.length,
    addPage: async (page) => pages.push(page),
    attach: async (owner, pageId, name) => void rows.push({ id: nextId++, owner, pageId, name }),
    remove: async (owner, id) => {
      const i = rows.findIndex((r) => r.id === id && r.owner === owner);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function setup(overrides: Partial<SourcesDeps> = {}) {
  const store = memoryStore();
  const read = vi.fn(async (url: string): Promise<PageRead> => ({ ...okRead, url } as PageRead));
  const sources: SourcesDeps = {
    store,
    read,
    clean: (text) => (text.startsWith('https://') ? text : null),
    newPage: (r, at) => ({ url: r.url, state: r.state, checked_at: at.toISOString(), next_due: at.toISOString(), failure_count: 0 }),
    ...overrides,
  };
  const app = createApp({
    corsOrigins: [],
    verifyToken: async () => null as never,
    repo: {} as Repo,
    data,
    sources,
    now: () => new Date('2026-11-07T10:00:00Z'),
  });
  return { app, store, read };
}

describe('farmer sources', () => {
  it('works without a session, and needs a well formed key', async () => {
    const { app } = setup();
    await request(app).get('/api/sources').expect(400);
    await request(app).get('/api/sources').set('x-source-key', 'short').expect(400);
    const res = await request(app).get('/api/sources').set(mine).expect(200);
    expect(res.body.sources).toEqual([]);
  });

  it('two adds of the same link at once read the page once and both get it (IDEM-14)', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((done) => (finish = done));
    const read = vi.fn(async (url: string): Promise<PageRead> => {
      await gate;
      return { ...okRead, url } as PageRead;
    });
    const { app, store } = setup({ read });
    const post = () => request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' }).then((r) => r);
    const both = Promise.all([post(), post()]);
    await new Promise((r) => setTimeout(r, 50));
    finish();
    const [a, b] = await both;
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.body.source.url).toBe(a.body.source.url);
    expect(read).toHaveBeenCalledOnce();
    expect(store.pages).toHaveLength(1);
    expect((await request(app).get('/api/sources').set(mine)).body.sources).toHaveLength(1);
  });

  it('leaves routes behind the session closed', async () => {
    const { app } = setup();
    await request(app).get('/api/me').set(mine).expect(401);
  });

  it('reads and saves a new link', async () => {
    const { app, read } = setup();
    const res = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x', name: 'AFIR' }).expect(201);
    expect(read).toHaveBeenCalledWith('https://afir.ro/x');
    expect(res.body.source).toMatchObject({ url: 'https://afir.ro/x', name: 'AFIR', state: 'ok' });
  });

  it('never shows one farmer the sources of another', async () => {
    const { app } = setup();
    const added = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' });
    const res = await request(app).get('/api/sources').set(yours).expect(200);
    expect(res.body.sources).toEqual([]);
    await request(app).delete(`/api/sources/${added.body.source.id}`).set(yours).expect(404);
    await request(app).delete(`/api/sources/${added.body.source.id}`).set(mine).expect(204);
  });

  it('reads a link once when two farmers add it', async () => {
    const { app, read } = setup();
    await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' }).expect(201);
    await request(app).post('/api/sources').set(yours).send({ url: 'https://afir.ro/x' }).expect(201);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('answers calmly when the farmer adds the same link again', async () => {
    const { app, read } = setup();
    await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' });
    const res = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' }).expect(200);
    expect(res.body.already).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('refuses a bad link before reading anything', async () => {
    const { app, read } = setup();
    await request(app).post('/api/sources').set(mine).send({ url: 'file:///etc/passwd' }).expect(400);
    await request(app).post('/api/sources').set(mine).send({ url: 'https://a.ro', extra: 1 }).expect(400);
    expect(read).not.toHaveBeenCalled();
  });

  it('saves nothing for a link that turns out to be private or not a page', async () => {
    for (const reason of ['private', 'unsupported'] as const) {
      const { app, store } = setup({ read: async (url) => ({ state: 'refused', reason, url }) });
      const res = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' }).expect(422);
      expect(res.body.error).toBe(reason);
      expect(store.pages).toEqual([]);
    }
  });

  it('keeps a page that could not be read, so the daily check can try again', async () => {
    const { app, store } = setup({ read: async (url) => ({ state: 'blocked', url }) });
    const res = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/x' }).expect(201);
    expect(res.body.source.state).toBe('blocked');
    expect(store.pages).toHaveLength(1);
  });

  it('stops a farmer at the daily limit', async () => {
    const { app } = setup();
    for (let i = 0; i < limits.adds_per_day.value; i++) {
      await request(app).post('/api/sources').set(mine).send({ url: `https://afir.ro/${i}` }).expect(201);
    }
    const res = await request(app).post('/api/sources').set(mine).send({ url: 'https://afir.ro/more' }).expect(429);
    expect(res.body.error).toBe('too_many_today');
  });

  it('stops new keys from the same address at the address limit', async () => {
    const { app } = setup();
    const keys = Array.from({ length: limits.ip_adds_per_day.value + 1 }, (_, i) => i.toString(36).padStart(43, 'k'));
    const answers = [];
    for (const [i, k] of keys.entries()) {
      answers.push((await request(app).post('/api/sources').set('x-source-key', k).send({ url: `https://afir.ro/${i}` })).status);
    }
    expect(answers.at(-1)).toBe(429);
    expect(answers.slice(0, -1).every((s) => s === 201)).toBe(true);
  });

  it('says busy when too many reads run at once', async () => {
    let finish = (_: PageRead) => {};
    const waiting = new Promise<PageRead>((resolve) => { finish = resolve; });
    const { app } = setup({ read: () => waiting });
    const server = app.listen(0);
    const first = Array.from({ length: limits.reads_at_once.value }, (_, i) =>
      request(server).post('/api/sources').set(mine).send({ url: `https://afir.ro/${i}` }).then((r) => r));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await request(server).post('/api/sources').set(yours).send({ url: 'https://afir.ro/z' }).expect(503);
    expect(res.body.error).toBe('busy');
    finish(okRead);
    await Promise.all(first);
    server.close();
  });
});
