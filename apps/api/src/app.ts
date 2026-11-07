import express from 'express';
import cors from 'cors';
import type { SupabaseFactory } from './db/supabase';
import { requireAuth, type TokenVerifier } from './middleware/auth';

export interface AppDeps {
  corsOrigins: string[];
  verifyToken: TokenVerifier;
  db: SupabaseFactory;
}

export function createApp({ corsOrigins, verifyToken, db }: AppDeps) {
  const app = express();

  app.use(cors({ origin: corsOrigins }));
  // Note: the Stripe webhook route (step 6) must be mounted BEFORE express.json(),
  // because signature verification needs the raw body.
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Everything below requires a valid Supabase session.
  app.use('/api', requireAuth(verifyToken));

  app.get('/api/me', async (_req, res) => {
    const { userId, token } = res.locals.auth;
    const { data, error } = await db.forUser(token).from('farmers').select('*').maybeSingle();
    if (error) {
      res.status(500).json({ error: 'db_error' });
      return;
    }
    res.json({ userId, farmer: data });
  });

  return app;
}
