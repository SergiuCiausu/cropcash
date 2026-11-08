import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { swSource, versionOf } from './service-worker.mjs';
import { webCacheList } from '../../scripts/write-sw.mjs';

/* A small copy of what `next build` writes to web/out. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cc-out-'));
  for (const f of ['index.html', 'salariu.html', '404.html', '_not-found.html', '_next/static/chunks/a.js', '_next/static/css/b.css', 'img/harvest-1200.jpg', 'notifications.css', 'sw.js', 'salariu.txt', 'ferma-lui-ion.html', 'ferma-lui-ion/salariu.html', 'ferma-lui-ion/salariu.txt']) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), f);
  }
  return root;
}

describe('the service worker for web/out', () => {
  const root = fixture();
  const { files, cached } = webCacheList(root);

  it('keeps every page, script, style and image', () => {
    for (const f of ['index.html', 'salariu.html', '_next/static/chunks/a.js', '_next/static/css/b.css', 'img/harvest-1200.jpg', 'notifications.css']) expect(files, f).toContain(f);
  });

  it('keeps each page under its route too', () => {
    expect(cached).toContain('salariu');
    expect(cached).toContain('./');
  });

  it('keeps Ion’s farm under its routes, one folder down', () => {
    expect(cached).toContain('ferma-lui-ion/salariu.html');
    expect(cached).toContain('ferma-lui-ion/salariu');
    expect(cached).toContain('ferma-lui-ion');
  });

  it('leaves out itself, the not-found page and the RSC payloads', () => {
    expect(cached.some((f: string) => f === 'sw.js' || f.startsWith('404') || f.startsWith('_not-found') || f.endsWith('.txt'))).toBe(false);
  });

  it('changes version only when a file changes', () => {
    expect(versionOf(root, files)).toBe(versionOf(root, files));
    expect(versionOf(root, files.slice(1))).not.toBe(versionOf(root, files));
  });

  it('writes a script that parses', () => {
    expect(() => new Function(swSource(cached, 'abc'))).not.toThrow();
  });
});

/* Runs the generated worker against fakes, as a browser would. */
function worker(files: string[], fetchFn: (req: unknown) => Promise<Response>, saved: Record<string, Response> = {}, addFails: string[] = []) {
  const store = new Map(Object.entries(saved));
  const cache = {
    match: async (k: string) => store.get(typeof k === 'string' ? k : (k as { url: string }).url)?.clone(),
    put: async (k: string, r: Response) => void store.set(typeof k === 'string' ? k : (k as { url: string }).url, r),
    add: async (f: string) => {
      if (addFails.includes(f)) throw new Error('404');
      store.set(f, new Response(f));
    },
    addAll: async (list: string[]) => {
      if (list.some((f) => addFails.includes(f))) throw new Error('404');
      list.forEach((f) => store.set(f, new Response(f)));
    },
  };
  const on: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (n: string, f: (e: unknown) => void) => void (on[n] = f), skipWaiting: async () => undefined, location: { origin: 'https://x.test' }, clients: { claim: async () => undefined } };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true };
  new Function('self', 'caches', 'fetch', swSource(files, 'v1'))(self, caches, fetchFn);
  return {
    store,
    respond: (url: string) => new Promise<Response>((done) => on.fetch!({ request: { method: 'GET', url }, respondWith: (p: Promise<Response>) => void p.then(done) })),
    install: () => new Promise<unknown>((done, fail) => on.install!({ waitUntil: (p: Promise<unknown>) => void p.then(done, fail) })),
  };
}

describe('what the worker does when something goes wrong (FAIL-10)', () => {
  const page = 'https://x.test/salariu';

  it('serves the saved page instead of an error from the host', async () => {
    const w = worker([], async () => new Response('down', { status: 503 }), { [page]: new Response('saved') });
    expect(await (await w.respond(page)).text()).toBe('saved');
  });

  it('passes the error on when there is no saved page', async () => {
    const w = worker([], async () => new Response('down', { status: 503 }));
    expect((await w.respond(page)).status).toBe(503);
  });

  it('saves a good answer', async () => {
    const w = worker([], async () => new Response('fresh'));
    expect(await (await w.respond(page)).text()).toBe('fresh');
    expect(w.store.has(page)).toBe(true);
  });

  it('uses the saved page with no network at all', async () => {
    const w = worker([], async () => { throw new TypeError('offline'); }, { [page]: new Response('saved') });
    expect(await (await w.respond(page)).text()).toBe('saved');
  });

  it('survives a font it cannot fetch offline', async () => {
    const w = worker([], async () => { throw new TypeError('offline'); });
    expect((await w.respond('https://fonts.gstatic.com/a.woff2')).type).toBe('error');
  });

  it('installs even when a photo fails', async () => {
    const w = worker(['index.html', 'img/big.jpg'], async () => new Response(''), {}, ['img/big.jpg']);
    await expect(w.install()).resolves.toBeUndefined();
    expect(w.store.has('index.html')).toBe(true);
  });

  it('does not call itself installed without the pages it needs', async () => {
    const w = worker(['index.html'], async () => new Response(''), {}, ['index.html']);
    await expect(w.install()).rejects.toThrow('404');
  });
});
