import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { AppData, SubsidyParams } from '@cropcash/shared';
import type { Repo } from './db/repo';
import { requireAuth, type TokenVerifier } from './middleware/auth';
import { farmersRouter } from './routes/farmers';
import { planRouter } from './routes/plan';
import { moneyRouter, webhookRouter, type MoneyDeps } from './routes/money';

export interface AppDeps {
  corsOrigins: string[];
  verifyToken: TokenVerifier;
  repo: Repo;
  data: AppData;
  subsidyParams?: SubsidyParams;
  /** Stripe money flows (step 6). Optional so unit tests can run without Stripe. */
  money?: MoneyDeps;
}

export function createApp({ corsOrigins, verifyToken, repo, data, subsidyParams = {}, money }: AppDeps) {
  const app = express();
  app.set('trust proxy', 'loopback');

  app.use(cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  // The Stripe webhook needs the raw body for signature checks: mount it before express.json().
  if (money) app.use('/api', webhookRouter(money));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Everything below requires a valid Supabase session.
  app.use('/api', requireAuth(verifyToken));
  app.use('/api', farmersRouter(repo, data, subsidyParams));
  app.use('/api', planRouter(repo));
  if (money) app.use('/api', moneyRouter(money));

  // Express 5 forwards rejected promises here. Never leak internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
