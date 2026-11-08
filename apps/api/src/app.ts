import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { AppData, SubsidyParams } from '@cropcash/shared';
import type { Repo } from './db/repo';
import { requireAuth, type TokenVerifier } from './middleware/auth';
import type { MonitorReader } from './monitor/reader';
import { opportunitiesRouter } from './routes/opportunities';
import { exchangeRatesProvider, type RatesProvider } from './fx/rates';
import type { DocumentReader } from './ai/documents';
import type { Assistant } from './ai/assistant';
import { assistantRouter } from './routes/assistant';
import { documentsRouter } from './routes/documents';
import { farmersRouter } from './routes/farmers';
import { functionsRouter } from './routes/functions';
import { planRouter } from './routes/plan';
import { recordsRouter } from './routes/records';
import { sourcesRouter, type SourcesDeps } from './routes/sources';
import { weatherRouter } from './routes/weather';
import { moneyRouter, webhookRouter, type MoneyDeps } from './routes/money';
import { createWeatherService, type WeatherService } from './weather';

export interface AppDeps {
  corsOrigins: string[];
  verifyToken: TokenVerifier;
  repo: Repo;
  data: AppData;
  subsidyParams?: SubsidyParams;
  /** The clock, replaceable in tests. */
  now?: () => Date;
  /** Defaults to the public Open-Meteo API. Replaced in tests. */
  weather?: WeatherService;
  /** Defaults to the public Frankfurter API. Replaced in tests. */
  getRates?: RatesProvider;
  /** What the monitor found. Without it, those reads answer 503. */
  monitor?: MonitorReader;
  /** A farmer's own sources. Without it, those routes don't exist. */
  sources?: SourcesDeps;
  /** Reads uploaded papers. Without it, that route answers 503. */
  readDocument?: DocumentReader;
  /** The Stripe flow. Without it, the routes that move money don't exist. */
  money?: MoneyDeps;
  /** The "Întreabă" assistant. Without it, that route answers 503. */
  assistant?: Assistant;
  /** Assistant messages per farmer per day. */
  assistantDailyLimit?: number;
}

export function createApp({
  corsOrigins,
  verifyToken,
  repo,
  data,
  subsidyParams = {},
  now = () => new Date(),
  weather = createWeatherService({ data }),
  getRates = exchangeRatesProvider(),
  monitor,
  sources,
  readDocument,
  money,
  assistant,
  assistantDailyLimit = 40,
}: AppDeps) {
  const reads = { repo, data, params: subsidyParams, now, getRates, monitor };
  const app = express();
  app.set('trust proxy', 'loopback');

  app.use(cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  // Before express.json(): the signature covers the raw body. Stripe has no session to send.
  if (money) app.use('/api', webhookRouter(money));
  // Before express.json() too: a paper is bigger than its limit. The session is checked first.
  app.use('/api', documentsRouter({ verifyToken, read: readDocument, data, now }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Before the session check: a private key in the browser stands in for sign-in here.
  if (sources) app.use('/api', sourcesRouter(sources, data, now));

  // Everything below requires a valid Supabase session.
  app.use('/api', requireAuth(verifyToken));
  app.use('/api', farmersRouter(repo, data, subsidyParams));
  app.use('/api', planRouter(repo, data));
  app.use('/api', recordsRouter(repo, data, subsidyParams, now));
  app.use('/api', functionsRouter(reads));
  app.use('/api', assistantRouter(reads, assistant, assistantDailyLimit));
  app.use('/api', opportunitiesRouter(repo));
  app.use('/api', weatherRouter(repo, weather));
  if (money) app.use('/api', moneyRouter(money));

  // Express 5 forwards rejected promises here. Never leak internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
