import { Router } from 'express';
import { z } from 'zod';
import type { Assistant } from '../ai/assistant';
import { readRunner, type ReadDeps } from './functions';

/** The conversation lives in the browser, so each request carries it, as text only. */
const AskSchema = z.strictObject({
  messages: z
    .array(z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20)
    .refine((m) => m[0]!.role === 'user' && m.at(-1)!.role === 'user', { message: 'starts and ends with the farmer' }),
});

/** Messages per farmer per day, kept in memory: an API restart resets them. */
export function dailyLimiter(limit: number, now: () => Date) {
  const used = new Map<string, { day: string; count: number }>();
  return (userId: string): boolean => {
    const day = now().toISOString().slice(0, 10);
    const entry = used.get(userId);
    const count = entry?.day === day ? entry.count : 0;
    if (count >= limit) return false;
    used.set(userId, { day, count: count + 1 });
    return true;
  };
}

/** POST /api/assistant. Without an Anthropic key the route answers 503 and the rest of the app works. */
export function assistantRouter(deps: ReadDeps, assistant: Assistant | undefined, dailyLimit: number): Router {
  const r = Router();
  const allow = dailyLimiter(dailyLimit, deps.now);

  r.post('/assistant', async (req, res) => {
    if (!assistant) {
      res.status(503).json({ error: 'assistant_unavailable' });
      return;
    }
    const parsed = AskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const reads = readRunner(deps, res.locals.auth.token);
    const today = await reads.today();
    if (!today) {
      res.status(404).json({ error: 'no_farm' });
      return;
    }
    if (!allow(res.locals.auth.userId)) {
      res.status(429).json({ error: 'daily_limit' });
      return;
    }
    try {
      res.json(await assistant({ turns: parsed.data.messages, today, runRead: (fn, input) => reads.run(fn, input) }));
    } catch (err) {
      console.error('[assistant]', err);
      res.status(502).json({ error: 'assistant_failed' });
    }
  });

  return r;
}
