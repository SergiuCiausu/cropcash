import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData, type DocumentExtraction } from '@cropcash/shared';
import { createApp } from './app';
import type { DocumentReader } from './ai/documents';
import type { FarmRow, Repo } from './db/repo';

const data = loadData();
const campaignYear = data.subsidies.meta.campaign_year;
const auth = { Authorization: 'Bearer good' };
const paper = { files: [{ mediaType: 'image/jpeg', data: '/9j/AAAA' }] };
const invoice: DocumentExtraction = { kind: 'invoice', year: null, crops: [], amount: '1.200,50', date: '2026-10-03', category: 'diesel', crop_id: null };

const farm = (): FarmRow => ({ id: 'f1', name: 'Ion', birth_year: 1971, parcels: [{ crop_id: 'grau', area_ari: 800, is_arable: true }] }) as unknown as FarmRow;

function setup({ read, hasFarm = true }: { read?: DocumentReader; hasFarm?: boolean } = {}) {
  const row = farm();
  const setApiaDecision = vi.fn(async () => {});
  const repo = { getMyFarm: vi.fn(async () => (hasFarm ? row : null)), setApiaDecision } as unknown as Repo;
  const verifyToken = async (token: string) => {
    if (!token.startsWith('good')) throw new Error('bad token');
    return { userId: `user-${token}` };
  };
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, readDocument: read, now: () => new Date('2026-11-07T10:00:00Z') });
  return { app, repo, setApiaDecision };
}

describe('POST /api/documents/read', () => {
  it('needs a session, before it reads the body', async () => {
    const read = vi.fn(async () => invoice);
    const { app } = setup({ read });
    const res = await request(app).post('/api/documents/read').send(paper);
    expect(res.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns checked fields, in bani', async () => {
    const { app } = setup({ read: async () => invoice });
    const res = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: 'invoice', amountBani: 120_050, date: '2026-10-03', category: 'diesel' });
  });

  it('works before a farm exists, because onboarding uses it', async () => {
    const { app } = setup({ read: async () => invoice, hasFarm: false });
    expect((await request(app).post('/api/documents/read').set(auth).send(paper)).status).toBe(200);
  });

  it('saves nothing', async () => {
    const { app, repo, setApiaDecision } = setup({ read: async () => ({ ...invoice, kind: 'apia_decizie', year: String(campaignYear) }) });
    await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(setApiaDecision).not.toHaveBeenCalled();
    expect(repo.getMyFarm).not.toHaveBeenCalled();
  });

  it('takes a paper far bigger than the normal body limit', async () => {
    const read = vi.fn(async () => invoice);
    const { app } = setup({ read });
    const big = { files: [{ mediaType: 'image/jpeg', data: `/9j/${'A'.repeat(1_000_000)}` }] };
    expect((await request(app).post('/api/documents/read').set(auth).send(big)).status).toBe(200);
  });

  it('refuses a body over the limit with its own answer', async () => {
    const { app } = setup({ read: async () => invoice });
    const size = (data.params.documents.max_mb.value * 4 * 1024 * 1024) / 3 + 3 * 1024 * 1024;
    const res = await request(app).post('/api/documents/read').set(auth).send({ files: [{ mediaType: 'image/jpeg', data: `/9j/${'A'.repeat(size)}` }] });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('too_large');
  });

  it('refuses a file that is not what it claims, without spending a read', async () => {
    const read = vi.fn(async () => invoice);
    const { app } = setup({ read });
    const res = await request(app).post('/api/documents/read').set(auth).send({ files: [{ mediaType: 'application/pdf', data: '/9j/AAAA' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_file');
    expect(read).not.toHaveBeenCalled();
  });

  it('answers 503 when no key is set', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('reader_off');
  });

  it('stops at the daily limit, for that farmer only', async () => {
    const read = vi.fn(async () => invoice);
    const { app } = setup({ read });
    // A different photo each time: the same one again would be a replay, which doesn't count.
    for (let i = 0; i < data.params.documents.reads_per_day.value; i++) {
      await request(app).post('/api/documents/read').set(auth).send({ files: [{ mediaType: 'image/jpeg', data: `/9j/AAAA${String(i).padStart(4, 'A')}` }] });
    }
    const res = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('too_many_reads');
    expect((await request(app).post('/api/documents/read').set({ Authorization: 'Bearer good2' }).send(paper)).status).toBe(200);
  });

  it('the same paper sent again gets the reading already paid for, without a second model call (IDEM-13)', async () => {
    const read = vi.fn(async () => invoice);
    const { app } = setup({ read });
    const first = await request(app).post('/api/documents/read').set(auth).send(paper);
    const again = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(read).toHaveBeenCalledOnce();
    // Another farmer sending the same photo is another request.
    await request(app).post('/api/documents/read').set({ Authorization: 'Bearer good2' }).send(paper);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('says so when the model gives no usable answer', async () => {
    const { app } = setup({ read: async () => null });
    const res = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('unreadable');
  });

  it('never logs the paper when reading fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = Object.assign(new Error(`bad request ${paper.files[0]!.data}`), { status: 500 });
    const { app } = setup({ read: async () => { throw failure; } });
    const res = await request(app).post('/api/documents/read').set(auth).send(paper);
    expect(res.status).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toContain('/9j/');
    log.mockRestore();
  });

  it('leaves the normal limit on every other route', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/functions/get_plan').set(auth).send({ x: 'A'.repeat(200_000) });
    expect(res.status).not.toBe(200);
  });
});

describe('the payment decision', () => {
  const decision = { campaignYear, totalBani: 1_690_050 };

  it('saves on the farm, as expected money', async () => {
    const { app, setApiaDecision } = setup();
    expect((await request(app).put('/api/farmers/me/apia-decision').set(auth).send(decision)).status).toBe(204);
    expect(setApiaDecision).toHaveBeenCalledWith('good', 'f1', decision);
  });

  it('refuses another campaign, a float and no session', async () => {
    const { app, setApiaDecision } = setup();
    const wrong = await request(app).put('/api/farmers/me/apia-decision').set(auth).send({ ...decision, campaignYear: campaignYear - 1 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('wrong_year');
    expect((await request(app).put('/api/farmers/me/apia-decision').set(auth).send({ ...decision, totalBani: 1.5 })).status).toBe(400);
    expect((await request(app).put('/api/farmers/me/apia-decision').send(decision)).status).toBe(401);
    expect(setApiaDecision).not.toHaveBeenCalled();
  });

  it('needs a farm', async () => {
    const { app } = setup({ hasFarm: false });
    expect((await request(app).put('/api/farmers/me/apia-decision').set(auth).send(decision)).status).toBe(404);
  });

  it('can be removed', async () => {
    const { app, setApiaDecision } = setup();
    expect((await request(app).delete('/api/farmers/me/apia-decision').set(auth)).status).toBe(204);
    expect(setApiaDecision).toHaveBeenCalledWith('good', 'f1', null);
  });
});
