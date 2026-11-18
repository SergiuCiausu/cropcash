import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkSource, nextDue } from '../src/detect.ts';
import { Fetcher } from '../src/fetcher.ts';
import { runChecks } from '../src/run.ts';
import type { Source } from '../src/store.ts';
import { MemoryStore } from './memory-store.ts';
import { simplePdf } from './pdf-fixture.ts';

const para = 'Fermierii pot depune cererile de finanțare până la data anunțată de agenția de plăți pentru sesiunea curentă. '.repeat(4);
const html = (body: string, visits = 1) =>
  `<html><body><nav>Meniu</nav><main><h1>Titlu</h1><p>${para}</p><p>${body}</p></main><footer>${visits}</footer></body></html>`;

interface Route {
  status?: number;
  body?: string | Uint8Array;
  etag?: string;
  lastModified?: string;
  contentType?: string;
  headFails?: boolean;
  redirect?: string;
  ignoresConditions?: boolean;
}

let routes: Record<string, Route>;
let requests: string[];
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/robots.txt') return void res.writeHead(404).end();
    requests.push(`${req.method} ${url}`);
    const route = routes[url];
    if (!route) return void res.writeHead(404).end();
    if (req.method === 'HEAD' && route.headFails) return void res.writeHead(404).end();
    if (route.redirect) return void res.writeHead(302, { location: route.redirect }).end();

    const headers: Record<string, string> = { 'content-type': route.contentType ?? 'text/html; charset=utf-8' };
    if (route.etag) headers.etag = route.etag;
    if (route.lastModified) headers['last-modified'] = route.lastModified;
    if (route.body !== undefined) headers['content-length'] = String(Buffer.byteLength(route.body));

    if (!route.ignoresConditions && route.etag && req.headers['if-none-match'] === route.etag) {
      return void res.writeHead(304, headers).end();
    }
    res.writeHead(route.status ?? 200, headers);
    res.end(req.method === 'HEAD' ? undefined : route.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => void server.close());

let store: MemoryStore;
let fetcher: Fetcher;
let day = 0;

beforeEach(() => {
  routes = {};
  requests = [];
  store = new MemoryStore();
  fetcher = new Fetcher({ userAgent: 'test/1.0', minDelayMs: 0, backoffMs: 1, retries: 0, robotsCache: store.robotsCache() });
  day = 0;
});

async function check(source: Source) {
  day += 1;
  const fresh = store.get(source.id);
  return checkSource(fresh, { store, fetcher, runId: 1, now: new Date(2026, 10, day) });
}

const gets = () => requests.filter((r) => r.startsWith('GET'));

describe('cascade', () => {
  it('records a baseline on the first visit, without reporting a change', async () => {
    routes['/p'] = { body: html('prima') };
    const s = store.add(`${base}/p`);
    expect(await check(s)).toBe('baseline');
    expect(store.kinds()).toEqual(['baseline']);
    expect(store.get(s.id).state).toBe('active');
    expect(store.snapshots).toHaveLength(1);
  });

  it('stops at 304 and stores nothing', async () => {
    routes['/p'] = { body: html('prima'), etag: '"v1"' };
    const s = store.add(`${base}/p`);
    await check(s);
    expect(await check(s)).toBe('not_modified');
    expect(store.snapshots).toHaveLength(1);
    expect(store.kinds()).toEqual(['baseline']);
  });

  it('does not read the body when a server ignores the condition but validators match', async () => {
    routes['/p'] = { body: html('prima'), etag: '"v1"', ignoresConditions: true };
    const s = store.add(`${base}/p`);
    await check(s);
    const before = fetcher.bytes;
    expect(await check(s)).toBe('not_modified');
    expect(fetcher.bytes).toBe(before);
  });

  it('treats a noise-only change as unchanged, with no validators at all', async () => {
    routes['/p'] = { body: html('prima', 100) };
    const s = store.add(`${base}/p`);
    await check(s);
    routes['/p'] = { body: html('prima', 101) };
    expect(await check(s)).toBe('same_text');
    expect(store.snapshots).toHaveLength(1);
    expect(store.kinds()).toEqual(['baseline']);
  });

  it('is not fooled by a Last-Modified that changes on every request', async () => {
    routes['/p'] = { body: html('prima'), lastModified: 'Sat, 07 Nov 2026 10:00:00 GMT' };
    const s = store.add(`${base}/p`);
    await check(s);
    routes['/p'] = { body: html('prima'), lastModified: 'Sat, 07 Nov 2026 11:00:00 GMT' };
    expect(await check(s)).toBe('same_text');
    expect(store.get(s.id).last_modified).toBe('Sat, 07 Nov 2026 11:00:00 GMT');
  });

  it('reports a real change with a diff, and saves it', async () => {
    routes['/p'] = { body: html('Termen: 15 noiembrie') };
    const s = store.add(`${base}/p`);
    await check(s);
    routes['/p'] = { body: html('Termen: 30 noiembrie') };
    expect(await check(s)).toBe('changed');
    expect(store.kinds()).toEqual(['baseline', 'changed']);
    const diff = store.snapshots.at(-1)?.diff ?? '';
    expect(diff).toContain('-Termen: 15 noiembrie');
    expect(diff).toContain('+Termen: 30 noiembrie');
    expect(store.events.at(-1)?.snapshotId).toBe(2);
  });

  it('flags a collapsed page instead of reporting a change, and keeps the good copy', async () => {
    routes['/p'] = { body: html('prima') };
    const s = store.add(`${base}/p`);
    await check(s);
    const hash = store.get(s.id).content_hash;
    routes['/p'] = { body: '<html><body><main>Eroare</main></body></html>' };
    expect(await check(s)).toBe('suspicious');
    expect(await check(s)).toBe('suspicious');
    expect(store.kinds()).toEqual(['baseline', 'suspicious']); // Reported once.
    expect(store.get(s.id).content_hash).toBe(hash);
    routes['/p'] = { body: html('prima') };
    expect(await check(s)).toBe('same_text');
    expect(store.kinds().at(-1)).toBe('returned');
  });

  it('marks a nearly empty first page for manual checking', async () => {
    routes['/js'] = { body: '<html><body><div id="app"></div></body></html>' };
    const s = store.add(`${base}/js`);
    await check(s);
    expect(store.get(s.id).state).toBe('needs_manual');
    expect(store.kinds()).toContain('needs_manual');
  });
});

describe('documents', () => {
  const lastModified = 'Thu, 06 Aug 2026 07:37:29 GMT';
  const pdf = (text: string, id = 'a') => simplePdf(text, id);
  const type = 'application/pdf';

  it('stops at HEAD when headers match, without a GET', async () => {
    routes['/g.pdf'] = { body: pdf('Ghid'), etag: '"1"', lastModified, contentType: type };
    const s = store.add(`${base}/g.pdf`, 'pdf');
    await check(s);
    requests = [];
    expect(await check(s)).toBe('headers');
    expect(gets()).toHaveLength(0);
  });

  it('works when the server only sends Last-Modified', async () => {
    routes['/g.pdf'] = { body: pdf('Ghid'), lastModified, contentType: type };
    const s = store.add(`${base}/g.pdf`, 'pdf');
    await check(s);
    requests = [];
    expect(await check(s)).toBe('headers');
  });

  it('downloads again when Last-Modified changes, and diffs the text', async () => {
    routes['/g.pdf'] = { body: pdf('Termen vechi'), lastModified, contentType: type };
    const s = store.add(`${base}/g.pdf`, 'pdf');
    await check(s);
    routes['/g.pdf'] = { body: pdf('Termen nou'), lastModified: 'Fri, 07 Aug 2026 07:37:29 GMT', contentType: type };
    expect(await check(s)).toBe('changed');
    expect(store.snapshots.at(-1)?.diff).toContain('+Termen nou');
  });

  it('does not report a re-saved PDF whose text is the same', async () => {
    routes['/g.pdf'] = { body: pdf('Ghid', 'a'), etag: '"1"', contentType: type };
    const s = store.add(`${base}/g.pdf`, 'pdf');
    await check(s);
    const firstFile = store.get(s.id).file_hash;
    routes['/g.pdf'] = { body: pdf('Ghid', 'b'), etag: '"2"', contentType: type };
    expect(await check(s)).toBe('same_text');
    expect(store.kinds()).toEqual(['baseline']);
    expect(store.get(s.id).file_hash).not.toBe(firstFile);
  });

  it('handles the AFIR pattern: HEAD fails, GET redirects, and a 304 saves the body', async () => {
    routes['/api/doc'] = { redirect: '/media/g.pdf', headFails: true };
    routes['/media/g.pdf'] = { body: pdf('Ghid'), etag: '"1"', lastModified, contentType: type };
    const s = store.add(`${base}/api/doc`, 'pdf');
    expect(await check(s)).toBe('baseline');
    expect(store.get(s.id).resolved_url).toBe(`${base}/media/g.pdf`);

    const before = fetcher.bytes;
    expect(await check(s)).toBe('not_modified');
    expect(fetcher.bytes).toBe(before);
  });

  it('falls back to a conditional GET when HEAD is refused', async () => {
    routes['/h.pdf'] = { body: pdf('Ghid'), etag: '"1"', contentType: type, headFails: true };
    const s = store.add(`${base}/h.pdf`, 'pdf');
    await check(s);
    const before = fetcher.bytes;
    expect(await check(s)).toBe('not_modified');
    expect(fetcher.bytes).toBe(before);
  });

  it('compares a scanned PDF by file hash, and says no diff is available', async () => {
    const scan = (id: string) => new TextEncoder().encode(`%PDF-1.4 scan ${id}`);
    routes['/s.pdf'] = { body: scan('1'), contentType: type };
    const s = store.add(`${base}/s.pdf`, 'pdf');
    await check(s);
    expect(store.events[0]?.detail).toMatch(/no extractable text/);
    routes['/s.pdf'] = { body: scan('2'), contentType: type };
    expect(await check(s)).toBe('changed');
    expect(store.events.at(-1)?.detail).toMatch(/no text diff/);
  });

  it('treats a re-sent identical scan as unchanged', async () => {
    const scan = new TextEncoder().encode('%PDF-1.4 scan');
    routes['/s.pdf'] = { body: scan, contentType: type };
    const s = store.add(`${base}/s.pdf`, 'pdf');
    await check(s);
    expect(await check(s)).toBe('same_text');
  });
});

describe('failures', () => {
  it('reports a removed source once, then its return', async () => {
    routes['/p'] = { body: html('prima') };
    const s = store.add(`${base}/p`);
    await check(s);
    delete routes['/p'];
    expect(await check(s)).toBe('gone');
    expect(await check(s)).toBe('gone');
    expect(store.kinds()).toEqual(['baseline', 'gone']);
    routes['/p'] = { body: html('prima') };
    await check(s);
    expect(store.kinds()).toEqual(['baseline', 'gone', 'returned']);
    expect(store.get(s.id).state).toBe('active');
  });

  it('treats a server error as temporary and retries on the next run', async () => {
    routes['/p'] = { body: html('prima') };
    const s = store.add(`${base}/p`);
    await check(s);
    const due = store.get(s.id).next_due;
    routes['/p'] = { status: 500 };
    expect(await check(s)).toBe('error');
    expect(await check(s)).toBe('error');
    expect(store.kinds()).toEqual(['baseline', 'error']);
    expect(store.get(s.id)).toMatchObject({ state: 'error', failure_count: 2, next_due: due });
  });

  it('never reports a block as a removed source', async () => {
    routes['/f'] = { status: 403, body: 'no' };
    const s = store.add(`${base}/f`);
    expect(await check(s)).toBe('error');
    expect(store.get(s.id).state).toBe('error');
  });
});

describe('nextDue', () => {
  it('schedules by calendar day', () => {
    const now = new Date('2026-11-07T18:30:00Z');
    expect(nextDue('daily', now)).toBe('2026-11-08T00:00:00.000Z');
    expect(nextDue('weekly', now)).toBe('2026-11-14T00:00:00.000Z');
  });
});

describe('runChecks', () => {
  it('skips sources that are not due, counts stops and keeps going after a crash', async () => {
    routes['/a'] = { body: html('a') };
    routes['/b'] = { body: html('b') };
    store.add(`${base}/a`);
    store.add(`${base}/b`);
    const crashing = Object.create(store) as MemoryStore;
    crashing.addEvent = async (e) => {
      if (e.sourceId === 1) throw new Error('boom');
      return store.addEvent(e);
    };
    const logs: string[] = [];
    const first = await runChecks(crashing, fetcher, (m) => logs.push(m), new Date('2026-11-07T10:00:00Z'));
    expect(first.stops).toEqual({ crashed: 1, baseline: 1 });
    expect(logs.some((l) => l.includes('crashed') && l.includes('boom'))).toBe(true);

    const second = await runChecks(store, fetcher, () => {}, new Date('2026-11-07T11:00:00Z'));
    expect(second.checked).toBe(1); // Only the source that crashed is still due.
  });
});
