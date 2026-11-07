import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { AppData, SubsidyParams } from '@cropcash/shared';
import type { Repo } from './db/repo';
import { requireAuth, type TokenVerifier } from './middleware/auth';
import { farmersRouter } from './routes/farmers';
import { planRouter } from './routes/plan';

export interface AppDeps {
  corsOrigins: string[];
  verifyToken: TokenVerifier;
  repo: Repo;
  data: AppData;
  subsidyParams?: SubsidyParams;
}

export function createApp({ corsOrigins, verifyToken, repo, data, subsidyParams = {} }: AppDeps) {
  const app = express();

  app.use(cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  // Note: the Stripe webhook route (step 6) must be mounted BEFORE express.json(),
  // because signature verification needs the raw body.
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Everything below requires a valid Supabase session.
  app.use('/api', requireAuth(verifyToken));
  app.use('/api', farmersRouter(repo, data, subsidyParams));
  app.use('/api', planRouter(repo));

  // Express 5 forwards rejected promises here. Never leak internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
