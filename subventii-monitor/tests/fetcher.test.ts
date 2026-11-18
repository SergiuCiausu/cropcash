import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Fetcher, classifyRedirect, describeError, validatorsMatch } from '../src/fetcher.ts';

let server: http.Server;
let base: string;
let flakyHits = 0;
let conditions: string[] = [];
let log: string[] = [];
let robotsBody = 'User-agent: *\nDisallow: /private\n';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    log.push(`${req.method} ${url} ${req.headers['user-agent']}`);
    conditions.push(String(req.headers['if-none-match']), String(req.headers['if-modified-since']));
    if (url === '/robots.txt') return void res.writeHead(200).end(robotsBody);
    if (url === '/ok') return void res.writeHead(200, { 'content-type': 'text/html', etag: '"abc"' }).end('hello');
    if (url === '/hop') return void res.writeHead(302, { location: '/ok' }).end();
    if (url === '/to-private') return void res.writeHead(302, { location: '/private/x' }).end();
    if (url === '/loop') return void res.writeHead(302, { location: '/loop' }).end();
    if (url === '/flaky') {
      flakyHits += 1;
      return void res.writeHead(flakyHits < 2 ? 503 : 200).end();
    }
    if (url === '/down') return void res.writeHead(503).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => void server.close());

beforeEach(() => {
  log = [];
  conditions = [];
  flakyHits = 0;
  robotsBody = 'User-agent: *\nDisallow: /private\n';
});

const make = (extra = {}) => new Fetcher({ userAgent: 'test-bot/1.0', minDelayMs: 0, backoffMs: 1, ...extra });

describe('get', () => {
  it('returns headers and sends the User-Agent', async () => {
    const r = await make().get(`${base}/ok`);
    expect(r).toMatchObject({ outcome: 'ok', httpStatus: 200, etag: '"abc"', redirectKind: 'none' });
    expect(log.some((l) => l.endsWith('test-bot/1.0'))).toBe(true);
  });

  it('follows redirects and records the final URL', async () => {
    const r = await make().get(`${base}/hop`);
    expect(r).toMatchObject({ outcome: 'ok', finalUrl: `${base}/ok`, redirectKind: 'moved', hops: 1 });
  });

  it('reports a 404', async () => {
    expect((await make().get(`${base}/missing`)).outcome).toBe('not_found');
  });

  it('does not request a disallowed path', async () => {
    const r = await make().get(`${base}/private/x`);
    expect(r.outcome).toBe('blocked_robots');
    expect(log.some((l) => l.includes('/private/x'))).toBe(false);
  });

  it('applies robots rules to a redirect target', async () => {
    const r = await make().get(`${base}/to-private`);
    expect(r.outcome).toBe('blocked_robots');
    expect(log.some((l) => l.includes('/private/x'))).toBe(false);
  });

  it('retries a server error, then succeeds', async () => {
    expect((await make().get(`${base}/flaky`)).outcome).toBe('ok');
    expect(flakyHits).toBe(2);
  });

  it('gives up after the retry limit', async () => {
    const r = await make({ retries: 1 }).get(`${base}/down`);
    expect(r.outcome).toBe('server_error');
    expect(log.filter((l) => l.includes('/down'))).toHaveLength(2);
  });

  it('returns the body and counts its bytes', async () => {
    const f = make();
    const r = await f.get(`${base}/ok`);
    expect(new TextDecoder().decode(r.body!)).toBe('hello');
    expect(f.bytes).toBe(5);
  });

  it('refuses a body over the size limit', async () => {
    const r = await make({ maxBytes: 2 }).get(`${base}/ok`);
    expect(r.outcome).toBe('too_large');
    expect(r.body).toBeNull();
  });

  it('sends conditional headers', async () => {
    await make().get(`${base}/ok`, { etag: '"abc"', lastModified: 'yesterday', contentLength: null });
    expect(conditions).toContain('"abc"');
    expect(conditions).toContain('yesterday');
  });

  it('stops on a redirect loop', async () => {
    const r = await make({ maxRedirects: 3 }).get(`${base}/loop`);
    expect(r.outcome).toBe('too_many_redirects');
  });

  it('honours a longer Crawl-delay from robots.txt', async () => {
    robotsBody = 'User-agent: *\nCrawl-delay: 1\n';
    const f = make();
    const start = Date.now();
    await f.get(`${base}/ok`);
    await f.get(`${base}/ok`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });
});

describe('head', () => {
  it('sends HEAD and reports the headers', async () => {
    const r = await make().head(`${base}/ok`);
    expect(r).toMatchObject({ outcome: 'ok', etag: '"abc"', body: null });
    expect(log.some((l) => l.startsWith('HEAD /ok'))).toBe(true);
  });
});

describe('validatorsMatch', () => {
  const v = (etag: string | null, lastModified: string | null, contentLength: string | null = null) =>
    ({ etag, lastModified, contentLength });

  it.each([
    ['same ETag', v('a', null), v('a', null), true],
    ['different ETag', v('a', null), v('b', null), false],
    ['same date', v(null, 'd'), v(null, 'd'), true],
    ['different date, same ETag', v('a', 'd1'), v('a', 'd2'), false],
    ['size changed', v('a', 'd', '10'), v('a', 'd', '11'), false],
    ['size 0 means unknown', v('a', 'd', '10'), v('a', 'd', '0'), true],
    ['size alone proves nothing', v(null, null, '10'), v(null, null, '10'), false],
    ['nothing to compare', v(null, null), v(null, null), false],
    ['ETag disappeared, date matches', v('a', 'd'), v(null, 'd'), true],
  ])('%s', (_, stored, current, expected) => {
    expect(validatorsMatch(stored, current)).toBe(expected);
  });
});

describe('classifyRedirect', () => {
  it.each([
    ['http://a.ro/x', 'https://www.a.ro/x/', 'minor'],
    ['https://a.ro/x', 'https://a.ro/y', 'moved'],
    ['https://a.ro/x', 'https://a.ro/', 'to_homepage'],
    ['https://a.ro/x', 'https://a.ro/x', 'none'],
  ])('%s → %s', (from, to, kind) => {
    expect(classifyRedirect(from, to)).toBe(kind);
  });
});

describe('describeError', () => {
  it('recognizes certificate failures', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'x' } });
    expect(describeError(err).outcome).toBe('tls_error');
  });

  it('recognizes timeouts', () => {
    expect(describeError(Object.assign(new Error('t'), { name: 'TimeoutError' })).outcome).toBe('timeout');
  });
});
