import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData, type MemberRole } from '@cropcash/shared';
import { createApp } from './app';
import type { FarmRow, Repo } from './db/repo';
import { InviteError, type MemberStore } from './db/members';
import { hashInviteCode } from './routes/members';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const NOW = new Date('2026-11-14T10:00:00Z');
const FARM = '11111111-1111-4111-8111-111111111111';
const WEB = 'https://cropcash.example';

const farm = {
  id: FARM,
  name: 'Ion',
  county: 'TR',
  birth_year: 1970,
  start_balance_bani: 0,
  parcels: [{ crop_id: 'grau', area_ari: 1500, is_arable: true }],
  stripe_account_id: 'acct_secret',
  employees: [{ id: 'e1', name: 'Nelu', cost_bani: 750000 }],
} as unknown as FarmRow;

/** The database's rules (migration 028), in memory: the owner is the token "ion". */
function memoryMembers() {
  const invites: { id: string; role: MemberRole; email: string | null; tokenHash: string; expiresAt: string; acceptedBy: string | null; revoked: boolean }[] = [];
  const members: { id: string; user: string; role: MemberRole }[] = [];
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const store: MemberStore = {
    createInvite: vi.fn(async (_t, _f, i) => {
      const x = id();
      invites.push({ id: x, role: i.role, email: i.email, tokenHash: i.tokenHash, expiresAt: i.expiresAt, acceptedBy: null, revoked: false });
      return x;
    }),
    listForOwner: vi.fn(async (_t, now) => ({
      members: members.map((m) => ({ id: m.id, user_id: m.user, role: m.role, created_at: NOW.toISOString() })),
      invites: invites.filter((i) => !i.acceptedBy && !i.revoked && i.expiresAt > now).map((i) => ({ id: i.id, role: i.role, email: i.email, expires_at: i.expiresAt, created_at: NOW.toISOString() })),
    })),
    removeMember: vi.fn(async (_t, mid) => {
      const at = members.findIndex((m) => m.id === mid);
      if (at < 0) return false;
      members.splice(at, 1);
      return true;
    }),
    revokeInvite: vi.fn(async (_t, iid) => {
      const i = invites.find((x) => x.id === iid && !x.acceptedBy && !x.revoked);
      if (i) i.revoked = true;
      return !!i;
    }),
    accept: vi.fn(async (token, hash) => {
      const i = invites.find((x) => x.tokenHash === hash);
      if (!i) throw new InviteError('not_found');
      if (i.revoked || (i.acceptedBy && i.acceptedBy !== token)) throw new InviteError('used');
      if (!i.acceptedBy && i.expiresAt < NOW.toISOString()) throw new InviteError('expired');
      if (token === 'ion') throw new InviteError('own_farm');
      if (!members.some((m) => m.user === token)) members.push({ id: id(), user: token, role: i.role });
      i.acceptedBy = token;
      return { farmerId: FARM, farmName: 'Ion', role: i.role };
    }),
    memberships: vi.fn(async (token) => members.filter((m) => m.user === token).map((m) => ({ farmerId: FARM, farmName: 'Ion', county: 'TR', role: m.role, since: NOW.toISOString() }))),
    leave: vi.fn(async (token, f) => {
      const at = members.findIndex((m) => m.user === token && f === FARM);
      if (at < 0) return false;
      members.splice(at, 1);
      return true;
    }),
    memberFarm: vi.fn(async (token, f) => {
      const m = members.find((x) => x.user === token);
      return m && f === FARM ? { role: m.role, farmer: farm as FarmRow & Record<string, unknown>, plots: { plots: [], seasons: [], operations: [] } } : null;
    }),
    emailOf: vi.fn(async (user) => `${user}@example.com`),
    sendInvite: vi.fn(async () => true),
  };
  return { store, invites, members };
}

function setup(over: Partial<MemberStore> = {}) {
  const mem = memoryMembers();
  Object.assign(mem.store, over);
  const repo = { getMyFarm: vi.fn(async (token: string) => (token === 'ion' ? farm : null)) } as unknown as Repo;
  const app = createApp({ corsOrigins: [WEB, 'http://localhost:5173'], verifyToken, repo, data, getRates: async () => null, members: mem.store, now: () => NOW });
  return { app, ...mem };
}

const invite = async (app: ReturnType<typeof setup>['app'], body: object = { role: 'accountant' }) => request(app).post('/api/farm/invites').set(as('ion')).send(body);
const codeOf = (link: string) => new URL(link).searchParams.get('cod')!;

describe('inviting', () => {
  it('needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/farm/invites').send({ role: 'accountant' })).status).toBe(401);
  });

  it('gives the farmer a one-time link, and keeps only its hash', async () => {
    const { app, invites } = setup();
    const res = await request(app).post('/api/farm/invites').set(as('ion')).set('Origin', 'http://localhost:5173').send({ role: 'accountant' });
    expect(res.status).toBe(201);
    expect(res.body.emailed).toBeNull();
    expect(res.body.link).toMatch(/^http:\/\/localhost:5173\/invitatie\?cod=[A-Za-z0-9_-]{43}$/);
    const code = codeOf(res.body.link);
    expect(invites[0]!.tokenHash).toBe(hashInviteCode(code));
    expect(JSON.stringify(invites)).not.toContain(code);
    // A week to use it.
    expect(invites[0]!.expiresAt).toBe('2026-11-21T10:00:00.000Z');
  });

  it('points the link at our own site, never at an origin it was sent from', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/farm/invites').set(as('ion')).set('Origin', 'https://evil.example').send({ role: 'viewer' });
    expect(res.body.link.startsWith(`${WEB}/invitatie?cod=`)).toBe(true);
  });

  it('emails the link when asked, and still returns it if the email can’t go', async () => {
    const { app, store } = setup();
    const sent = await invite(app, { role: 'accountant', email: 'Contabil@Firma.ro' });
    expect(sent.body.emailed).toBe(true);
    expect(store.sendInvite).toHaveBeenCalledWith('contabil@firma.ro', sent.body.link);
    store.sendInvite = vi.fn(async () => {
      throw new Error('rate limit');
    });
    const failed = await invite(app, { role: 'accountant', email: 'a@b.ro' });
    expect(failed.status).toBe(201);
    expect(failed.body).toMatchObject({ emailed: false, link: expect.stringContaining('/invitatie?cod=') });
  });

  it('refuses a bad role, a bad email, someone without a farm, and too many open links', async () => {
    const { app } = setup();
    expect((await invite(app, { role: 'admin' })).status).toBe(400);
    expect((await invite(app, { role: 'viewer', email: 'nu e email' })).status).toBe(400);
    expect((await request(app).post('/api/farm/invites').set(as('ana')).send({ role: 'viewer' })).status).toBe(404);
    for (let i = 0; i < 10; i++) expect((await invite(app)).status).toBe(201);
    expect((await invite(app)).body).toEqual({ error: 'too_many_invites' });
  });
});

describe('accepting and reading', () => {
  it('lets the accountant in once, then shows them the farm without its Stripe account', async () => {
    const { app } = setup();
    const code = codeOf((await invite(app)).body.link);
    expect((await request(app).post('/api/invites/accept').set(as('ana')).send({ code: 'x'.repeat(43) })).body).toEqual({ error: 'not_found' });
    const ok = await request(app).post('/api/invites/accept').set(as('ana')).send({ code });
    expect(ok.body).toEqual({ farmerId: FARM, farmName: 'Ion', role: 'accountant' });
    // The same person again is fine; someone else with the same link is not.
    expect((await request(app).post('/api/invites/accept').set(as('ana')).send({ code })).status).toBe(200);
    expect((await request(app).post('/api/invites/accept').set(as('vlad')).send({ code })).body).toEqual({ error: 'used' });

    expect((await request(app).get('/api/memberships').set(as('ana'))).body.farms).toEqual([expect.objectContaining({ farmerId: FARM, role: 'accountant' })]);
    const read = await request(app).get(`/api/memberships/${FARM}`).set(as('ana'));
    expect(read.body.role).toBe('accountant');
    expect(read.body.farmer.stripe_account_id).toBeUndefined();
    expect(read.body.farmer.employees[0].name).toBe('Nelu');
    expect((await request(app).get(`/api/memberships/${FARM}`).set(as('vlad'))).status).toBe(404);
  });

  it('hides the names of the farm’s people from someone of the farm', async () => {
    const { app } = setup();
    const code = codeOf((await invite(app, { role: 'viewer' })).body.link);
    await request(app).post('/api/invites/accept').set(as('fiica')).send({ code });
    const read = await request(app).get(`/api/memberships/${FARM}`).set(as('fiica'));
    expect(read.body.farmer.employees[0]).toMatchObject({ name: '', cost_bani: 750000 });
  });

  it('says why a link doesn’t work', async () => {
    const { app, invites } = setup();
    const code = codeOf((await invite(app)).body.link);
    expect((await request(app).post('/api/invites/accept').set(as('ion')).send({ code })).body).toEqual({ error: 'own_farm' });
    invites[0]!.expiresAt = '2026-11-01T00:00:00.000Z';
    expect((await request(app).post('/api/invites/accept').set(as('ana')).send({ code })).body).toEqual({ error: 'expired' });
    expect((await request(app).post('/api/invites/accept').set(as('ana')).send({ code: 'short' })).status).toBe(400);
  });

  it('gives a member no way to write: the farm’s routes still find no farm of theirs', async () => {
    const { app } = setup();
    const code = codeOf((await invite(app)).body.link);
    await request(app).post('/api/invites/accept').set(as('ana')).send({ code });
    expect((await request(app).post('/api/sales').set(as('ana')).send({ cropId: 'grau', date: '2026-11-01', totalLei: 10 })).status).toBe(404);
    expect((await request(app).post('/api/farm/invites').set(as('ana')).send({ role: 'viewer' })).status).toBe(404);
  });
});

describe('who sees the farm', () => {
  it('lists members with their email and the open links, and lets the farmer remove either', async () => {
    const { app } = setup();
    const code = codeOf((await invite(app)).body.link);
    await request(app).post('/api/invites/accept').set(as('ana')).send({ code });
    const pending = await invite(app, { role: 'viewer', email: 'fiica@example.com' });
    const list = (await request(app).get('/api/farm/members').set(as('ion'))).body;
    expect(list.members).toEqual([expect.objectContaining({ role: 'accountant', email: 'ana@example.com' })]);
    expect(list.invites).toEqual([expect.objectContaining({ id: pending.body.id, role: 'viewer', email: 'fiica@example.com', expiresAt: '2026-11-21T10:00:00.000Z' })]);
    expect((await request(app).delete(`/api/farm/invites/${pending.body.id}`).set(as('ion'))).status).toBe(204);
    expect((await request(app).delete(`/api/farm/invites/${pending.body.id}`).set(as('ion'))).status).toBe(404);
    expect((await request(app).delete(`/api/farm/members/${list.members[0].id}`).set(as('ion'))).status).toBe(204);
    expect((await request(app).get('/api/memberships').set(as('ana'))).body.farms).toEqual([]);
  });

  it('lets a member leave', async () => {
    const { app } = setup();
    const code = codeOf((await invite(app)).body.link);
    await request(app).post('/api/invites/accept').set(as('ana')).send({ code });
    expect((await request(app).delete(`/api/memberships/${FARM}`).set(as('ana'))).status).toBe(204);
    expect((await request(app).delete(`/api/memberships/${FARM}`).set(as('ana'))).status).toBe(404);
  });
});
