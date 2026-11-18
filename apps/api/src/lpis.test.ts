import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { LPIS_SERVICE_URL, loadData, parseBlocs } from '@cropcash/shared';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import blocMissing from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-missing.json';
import communesTR from '../../../packages/shared/src/plots/__fixtures__/lpis-communes-TR.json';
import extent from '../../../packages/shared/src/plots/__fixtures__/lpis-extent-153277.json';
import { createApp } from './app';
import type { Repo } from './db/repo';
import { LpisUnavailable, lpisClient, type LpisSource } from './lpis/client';

const DAY = 24 * 60 * 60 * 1000;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lpis-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake APIA that answers by what the URL asks for. */
function fakeApia() {
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = decodeURIComponent(String(url));
    if (u.includes("fbid='153277-286'")) return answer(bloc286);
    if (u.includes('fbid=')) return answer(blocMissing);
    if (u.includes('returnExtentOnly')) return answer(extent);
    if (u.includes("judet='TR'")) return answer(communesTR);
    if (u.includes('esriGeometryPoint')) return answer(bloc286);
    return answer({ error: { code: 400, message: 'bad' } });
  });
  return fetchFn;
}

describe('LPIS client', () => {
  it('asks APIA once, then answers from disk for 30 days', async () => {
    const fetchFn = fakeApia();
    let now = 0;
    const client = () => lpisClient({ serviceUrl: LPIS_SERVICE_URL, cacheDir: dir, fetchFn, now: () => now });
    const found = await client().bloc(153277, '286');
    expect(found).toMatchObject({ fbid: '153277-286', netAreaAri: 854 });
    now = 29 * DAY;
    // A new client (an API restart) reads the same disk cache.
    expect(await client().bloc(153277, '286')).toEqual(found);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = 31 * DAY;
    await client().bloc(153277, '286');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps "no such bloc" for a day only', async () => {
    const fetchFn = fakeApia();
    let now = 0;
    const client = lpisClient({ serviceUrl: LPIS_SERVICE_URL, cacheDir: dir, fetchFn, now: () => now });
    expect(await client.bloc(153277, '999999')).toBeNull();
    now = DAY / 2;
    await client.bloc(153277, '999999');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = DAY + 1;
    await client.bloc(153277, '999999');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('uses an old answer when APIA is down, and says unavailable when there is none', async () => {
    let now = 0;
    let down = false;
    const apia = fakeApia();
    const fetchFn = vi.fn(async (url: string | URL | Request) => (down ? answer({}, 502) : apia(url)));
    const client = lpisClient({ serviceUrl: LPIS_SERVICE_URL, cacheDir: dir, fetchFn, now: () => now });
    await client.bloc(153277, '286');
    now = 60 * DAY;
    down = true;
    expect((await client.bloc(153277, '286'))?.fbid).toBe('153277-286');
    await expect(client.bloc(153277, '287')).rejects.toBeInstanceOf(LpisUnavailable);
  });

  it('treats an ArcGIS error or an unreadable answer as unavailable, and caches neither', async () => {
    const fetchFn = vi.fn(async () => answer({ error: { code: 400 } }));
    const client = lpisClient({ serviceUrl: LPIS_SERVICE_URL, cacheDir: dir, fetchFn });
    await expect(client.communeCentre(153277)).rejects.toBeInstanceOf(LpisUnavailable);
    fetchFn.mockResolvedValueOnce(answer({ nonsense: true }));
    await expect(client.communeCentre(153277)).rejects.toBeInstanceOf(LpisUnavailable);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares one request between callers asking the same thing at once', async () => {
    const fetchFn = fakeApia();
    const client = lpisClient({ serviceUrl: LPIS_SERVICE_URL, cacheDir: dir, fetchFn });
    const [a, b] = await Promise.all([client.communes('TR'), client.communes('TR')]);
    expect(a).toEqual(b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await client.communeCentre(153277)).toEqual([expect.closeTo(24.906375, 5), expect.closeTo(44.111895, 5)]);
  });
});

describe('LPIS routes', () => {
  const data = loadData();
  const verifyToken = async () => ({ userId: 'u1', email: 'ion@example.com' });
  const auth = { Authorization: 'Bearer ion' };
  const [bloc] = parseBlocs(bloc286);

  function setup(over: Partial<LpisSource> = {}) {
    const lpis: LpisSource = {
      bloc: vi.fn(async (_s: number, b: string) => (b === '286' ? bloc! : null)),
      at: vi.fn(async () => [bloc!]),
      communes: vi.fn(async () => [
        { siruta: 151790, name: 'Alexandria' },
        { siruta: 153277, name: 'Maldaeni' },
      ]),
      communeCentre: vi.fn(async (s: number) => (s === 153277 ? ([24.906375, 44.111895] as [number, number]) : null)),
      ...over,
    };
    return { app: createApp({ corsOrigins: [], verifyToken, repo: {} as Repo, data, getRates: async () => null, lpis }), lpis };
  }

  it('finds a bloc as printed on the paper, and says when there is none', async () => {
    const { app, lpis } = setup();
    expect((await request(app).get('/api/lpis/bloc?siruta=153277&bloc=0286')).status).toBe(401);
    const found = await request(app).get('/api/lpis/bloc?siruta=153277&bloc=0286').set(auth);
    expect(found.status).toBe(200);
    expect(found.body.bloc).toMatchObject({ fbid: '153277-286' });
    // Where it is (step 1b): Măldăeni has one village, so the bloc is by it.
    expect(found.body.bloc.place).toMatchObject({
      village: { siruta: 153286, name: 'Măldăeni' },
      commune: { siruta: 153277, name: 'Măldăeni', kind: 'commune' },
      county: 'TR',
      method: 'only_village',
      text: 'satul Măldăeni, comuna Măldăeni',
    });
    expect(lpis.bloc).toHaveBeenCalledWith(153277, '286');
    expect((await request(app).get('/api/lpis/bloc?siruta=153277&bloc=287').set(auth)).status).toBe(404);
    expect((await request(app).get("/api/lpis/bloc?siruta=153277&bloc=1' or '1'='1").set(auth)).status).toBe(400);
    expect((await request(app).get('/api/lpis/bloc?siruta=abc&bloc=1').set(auth)).status).toBe(400);
  });

  it('finds the bloc under a point, only inside Romania', async () => {
    const { app, lpis } = setup();
    const at = (await request(app).get('/api/lpis/at?lng=24.9622&lat=44.1162').set(auth)).body.blocs;
    expect(at).toHaveLength(1);
    expect(at[0].place.text).toBe('satul Măldăeni, comuna Măldăeni');
    expect(lpis.at).toHaveBeenCalledWith([24.9622, 44.1162]);
    expect((await request(app).get('/api/lpis/at?lng=2.35&lat=48.85').set(auth)).status).toBe(400);
  });

  it("searches a county's UATs, and gives a UAT's middle", async () => {
    const { app } = setup();
    expect((await request(app).get('/api/siruta?county=tr&q=măldă').set(auth)).body).toEqual({ communes: [{ siruta: 153277, name: 'Maldaeni' }] });
    expect((await request(app).get('/api/siruta?county=TR').set(auth)).body.communes).toHaveLength(2);
    expect((await request(app).get('/api/siruta?county=Teleorman').set(auth)).status).toBe(400);
    expect((await request(app).get('/api/siruta/153277/centre').set(auth)).body).toEqual({ centre: [24.906375, 44.111895] });
    expect((await request(app).get('/api/siruta/1/centre').set(auth)).status).toBe(404);
  });

  it('answers 503 when APIA is down, so the phone falls back', async () => {
    const { app } = setup({
      bloc: vi.fn(async () => {
        throw new LpisUnavailable('APIA answered 502');
      }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await request(app).get('/api/lpis/bloc?siruta=153277&bloc=286').set(auth);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'lpis_unavailable' });
  });
});
