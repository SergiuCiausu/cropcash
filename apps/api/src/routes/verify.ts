import { Router } from 'express';
import { AnswerInputSchema, OPEN_QUESTIONS, scanData, type VerifyAnswer } from '@cropcash/shared/verify';
import type { VerifyStore } from '../db/verify';
import { requireAdmin } from '../middleware/admin';

/*
 * „De verificat” (docs/admin-verificari-plan.md, step 3): the answers admins give to the to-check items.
 * The items come from the files this API was built with, so an answer to a key that isn't there is refused.
 */

export interface VerifyDeps {
  store: VerifyStore;
  /** Sign-in emails, lower case (ADMIN_EMAILS, else DEMO_EMAIL), as for /admin. */
  admins: readonly string[];
}

/** Every key an answer may point at: the data items and the open questions. */
export function knownKeys(): Set<string> {
  return new Set([...scanData().map((i) => i.key), ...OPEN_QUESTIONS.map((q) => q.key)]);
}

export function verifyRouter({ store, admins }: VerifyDeps, keys: ReadonlySet<string> = knownKeys()): Router {
  const r = Router();
  const admin = requireAdmin(admins);

  r.get('/admin/verify/answers', admin, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const answers: VerifyAnswer[] = await store.list();
    res.json({ answers });
  });

  r.post('/admin/verify/answers', admin, async (req, res) => {
    const parsed = AnswerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_answer', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    if (!keys.has(parsed.data.itemKey)) {
      res.status(400).json({ error: 'unknown_item' });
      return;
    }
    const auth = res.locals.auth;
    const answer = await store.add(parsed.data, { userId: auth.userId, email: auth.email?.toLowerCase() ?? null });
    res.status(201).json({ answer });
  });

  return r;
}
