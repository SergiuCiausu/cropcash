import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { AcceptInviteSchema, InviteInputSchema, inviteExpiry, MAX_OPEN_INVITES, memberFarmView } from '@cropcash/shared';
import type { Repo } from '../db/repo';
import { InviteError, type MemberStore } from '../db/members';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only the hash goes to the database; the code itself lives in the link alone. */
export const hashInviteCode = (code: string) => createHash('sha256').update(code).digest('hex');

export interface MembersDeps {
  repo: Repo;
  members: MemberStore;
  /** The web app's origins: the link points at the one the farmer is using, if it's one of them. */
  webOrigins: string[];
  now: () => Date;
  /** Replaceable in tests. */
  newCode?: () => string;
}

/**
 * Who else sees the farm's reports (migration 028; docs/rapoarte-pdf-plan.md §6). The owner invites
 * and removes; a member accepts a link, lists their farms, reads one, or leaves. Members never write.
 */
export function membersRouter({ repo, members, webOrigins, now, newCode = () => randomBytes(32).toString('base64url') }: MembersDeps): Router {
  const r = Router();

  /* ---- The owner ---- */

  r.get('/farm/members', async (_req, res) => {
    const { token } = res.locals.auth;
    if (!(await repo.getMyFarm(token))) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const list = await members.listForOwner(token, now().toISOString());
    const withEmail = await Promise.all(list.members.map(async (m) => ({ id: m.id, role: m.role, since: m.created_at, email: await members.emailOf(m.user_id) })));
    res.json({ members: withEmail, invites: list.invites.map((i) => ({ id: i.id, role: i.role, email: i.email, expiresAt: i.expires_at, createdAt: i.created_at })) });
  });

  r.post('/farm/invites', async (req, res) => {
    const parsed = InviteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { token } = res.locals.auth;
    const farm = await repo.getMyFarm(token);
    if (!farm) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    const open = await members.listForOwner(token, now().toISOString());
    if (open.invites.length >= MAX_OPEN_INVITES) {
      res.status(409).json({ error: 'too_many_invites' });
      return;
    }
    const code = newCode();
    const id = await members.createInvite(token, farm.id, { role: parsed.data.role, email: parsed.data.email ?? null, tokenHash: hashInviteCode(code), expiresAt: inviteExpiry(now()) });
    const origin = req.get('origin');
    const base = origin && webOrigins.includes(origin) ? origin : webOrigins[0];
    const link = `${base}/invitatie?cod=${code}`;
    /* The link comes back either way: if the email can't go, the farmer still sends it on WhatsApp. */
    const emailed = parsed.data.email ? await members.sendInvite(parsed.data.email, link).catch(() => false) : null;
    res.status(201).json({ id, link, emailed });
  });

  r.delete('/farm/invites/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const done = await members.revokeInvite(res.locals.auth.token, req.params.id, now().toISOString());
    res.status(done ? 204 : 404).end();
  });

  r.delete('/farm/members/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const done = await members.removeMember(res.locals.auth.token, req.params.id);
    res.status(done ? 204 : 404).end();
  });

  /* ---- The member ---- */

  r.post('/invites/accept', async (req, res) => {
    const parsed = AcceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'not_found' });
      return;
    }
    try {
      const farm = await members.accept(res.locals.auth.token, hashInviteCode(parsed.data.code));
      res.json(farm);
    } catch (e) {
      if (e instanceof InviteError) {
        res.status(e.code === 'not_found' ? 404 : 409).json({ error: e.code });
        return;
      }
      throw e;
    }
  });

  r.get('/memberships', async (_req, res) => {
    res.json({ farms: await members.memberships(res.locals.auth.token) });
  });

  r.get('/memberships/:farmerId', async (req, res) => {
    if (!UUID.test(req.params.farmerId)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const farm = await members.memberFarm(res.locals.auth.token, req.params.farmerId);
    if (!farm) {
      res.status(404).json({ error: 'not_member' });
      return;
    }
    res.json({ role: farm.role, farmer: memberFarmView(farm.farmer, farm.role), plots: farm.plots });
  });

  r.delete('/memberships/:farmerId', async (req, res) => {
    if (!UUID.test(req.params.farmerId)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const done = await members.leave(res.locals.auth.token, req.params.farmerId);
    res.status(done ? 204 : 404).end();
  });

  return r;
}
