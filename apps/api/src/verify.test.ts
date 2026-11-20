import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import type { AnswerInput, VerifyAnswer } from '@cropcash/shared/verify';
import { createApp } from './app';
import type { Repo } from './db/repo';
import { toAnswer, type VerifyStore } from './db/verify';
import { knownKeys } from './routes/verify';

/* „De verificat” answers (docs/admin-verificari-plan.md step 3), on an in-memory store like migration 054. */

function memoryStore() {
  const rows: VerifyAnswer[] = [];
  let n = 0;
  const store: VerifyStore = {
    list: async () => [...rows].sort((a, b) => b.at.localeCompare(a.at)),
    add: async (a: AnswerInput, by) => {
      n++;
      const row = toAnswer({
        id: `a${n}`,
        item_key: a.itemKey,
        verdict: a.verdict,
        new_value: a.verdict === 'wrong' ? { v: a.newValue ?? null } : null,
        source_url: a.sourceUrl ?? null,
        note: a.note,
        by_email: by.email,
        at: `2026-11-20T10:0${n}:00Z`,
      });
      rows.push(row);
      return row;
    },
  };
  return { store, rows };
}

const KEY = 'subsidies-2026.json:schemes[code=PD-05].eligibility.rules[0]#status';
const verifyToken = async (token: string) =>
  token === 'admin' ? { userId: 'u-admin', email: 'Ion@CropCash.test' } : { userId: 'u-farmer', email: 'vasile@example.com' };
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

function setup() {
  const { store, rows } = memoryStore();
  const app = createApp({
    corsOrigins: [],
    verifyToken,
    repo: {} as Repo,
    data: loadData(),
    now: () => new Date('2026-11-20T10:00:00Z'),
    getRates: async () => null,
    verify: { store, admins: ['ion@cropcash.test'] },
  });
  return { app, rows };
}

const confirmed = { itemKey: KEY, verdict: 'confirmed', sourceUrl: 'https://apia.org.ro/pd-05', note: 'Ghidul APIA 2026 dă 10 ha pe fermă' };

describe('„De verificat” answers', () => {
  it('needs a session, and an admin', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/admin/verify/answers')).status).toBe(401);
    expect((await request(app).get('/api/admin/verify/answers').set(as('farmer'))).status).toBe(403);
    expect((await request(app).post('/api/admin/verify/answers').set(as('farmer')).send(confirmed)).status).toBe(403);
  });

  it('records an answer with who gave it and lists the newest first', async () => {
    const { app, rows } = setup();
    const first = await request(app).post('/api/admin/verify/answers').set(as('admin')).send({ ...confirmed, verdict: 'open', sourceUrl: null, note: 'Ghidul nu se deschide' });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/admin/verify/answers').set(as('admin')).send({ ...confirmed, verdict: 'wrong', newValue: null });
    expect(second.body.answer).toMatchObject({ verdict: 'wrong', newValue: null, byEmail: 'ion@cropcash.test' });
    expect(rows).toHaveLength(2);
    const list = await request(app).get('/api/admin/verify/answers').set(as('admin'));
    expect(list.body.answers.map((a: VerifyAnswer) => a.verdict)).toEqual(['wrong', 'open']);
  });

  it('refuses an item that is not in the files or the doc', async () => {
    const { app, rows } = setup();
    const res = await request(app).post('/api/admin/verify/answers').set(as('admin')).send({ ...confirmed, itemKey: 'subsidies-2026.json:nimic#status' });
    expect(res.body).toEqual({ error: 'unknown_item' });
    expect(rows).toHaveLength(0);
  });

  it('refuses a confirmed answer without an https source', async () => {
    const { app } = setup();
    for (const sourceUrl of [null, 'http://apia.org.ro', 'apia.org.ro']) {
      const res = await request(app).post('/api/admin/verify/answers').set(as('admin')).send({ ...confirmed, sourceUrl });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_answer');
    }
  });

  it('takes answers to the open questions too', async () => {
    const keys = knownKeys();
    expect(keys.has(KEY)).toBe(true);
    expect([...keys].some((k) => k.startsWith('q:A'))).toBe(true);
    const { app } = setup();
    const q = [...keys].find((k) => k.startsWith('q:D'))!;
    expect((await request(app).post('/api/admin/verify/answers').set(as('admin')).send({ itemKey: q, verdict: 'not_needed', note: 'scos din MVP' })).status).toBe(201);
  });
});
