import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { AppData, SubsidyParams } from '@cropcash/shared';
import type { Repo } from './db/repo';
import { requireAuth, type TokenVerifier } from './middleware/auth';
import type { MonitorReader } from './monitor/reader';
import { opportunitiesRouter } from './routes/opportunities';
import { exchangeRatesProvider, type RatesProvider } from './fx/rates';
import type { DocumentReader } from './ai/documents';
import type { ContractReader } from './ai/contract';
import type { Assistant } from './ai/assistant';
import { assistantRouter } from './routes/assistant';
import { documentsRouter } from './routes/documents';
import { farmersRouter } from './routes/farmers';
import { fertilizersRouter, type FertilizerDeps } from './routes/fertilizers';
import { functionsRouter } from './routes/functions';
import { planRouter } from './routes/plan';
import { plotsRouter } from './routes/plots';
import type { PlotStore } from './db/plots';
import { lpisRouter } from './routes/lpis';
import type { LpisSource } from './lpis/client';
import { eventsRouter } from './routes/events';
import type { EventStore } from './db/events';
import { employeesRouter } from './routes/employees';
import { arendaRouter } from './routes/arenda';
import type { ArendaStore } from './db/arenda';
import { allFarmsContracts, contractsRouter } from './routes/contracts';
import type { ContractStore } from './db/contracts';
import type { EmployeeStore } from './db/employees';
import { membersRouter } from './routes/members';
import type { MemberStore } from './db/members';
import { recordsRouter } from './routes/records';
import { sourcesRouter, type SourcesDeps } from './routes/sources';
import { weatherRouter } from './routes/weather';
import { moneyRouter, webhookRouter, type MoneyDeps } from './routes/money';
import { predictionsRouter, type PredictionDeps } from './routes/admin';
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
  /** Contract papers (step 8). Without it, POST /api/documents/read-contract answers 503 reader_off. */
  readContract?: ContractReader;
  /** The Stripe flow. Without it, the routes that move money don't exist. */
  money?: MoneyDeps;
  /** The "Întreabă" assistant. Without it, that route answers 503. */
  assistant?: Assistant;
  /** Assistant messages per farmer per day. */
  assistantDailyLimit?: number;
  /** The fertilizer catalogue. Without it, those routes don't exist. */
  fertilizers?: FertilizerDeps;
  /** Parcels on the map. Without it, those routes don't exist. */
  plots?: PlotStore;
  /** APIA's blocs, for finding parcels on the map. Without it, those routes don't exist. */
  lpis?: LpisSource;
  /** The farmer's own calendar events. Without it, those routes don't exist. */
  events?: EventStore;
  /** The farm's people. Without it, those routes don't exist. */
  employees?: EmployeeStore;
  arenda?: ArendaStore;
  /** The farm's other contracts (migration 048). Without it, those routes don't exist. */
  contracts?: ContractStore;
  /** Who else sees the farm's reports (migration 028). Without it, those routes don't exist. */
  members?: MemberStore;
  /**
   * The admin panel's published changes to docs/data. `data` should then be liveData(source), so
   * every route reads the version in force. Without it, those routes don't exist.
   */
  predictions?: PredictionDeps;
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
  readContract,
  money,
  assistant,
  assistantDailyLimit = 5,
  fertilizers,
  plots,
  lpis,
  events,
  employees,
  arenda,
  contracts,
  members,
  predictions,
}: AppDeps) {
  const reads = { repo, data, params: subsidyParams, now, getRates, monitor, allFarms: contracts ? (token: string) => allFarmsContracts(contracts, data, now, token) : undefined };
  const app = express();
  app.set('trust proxy', 'loopback');

  app.use(cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
  // Before express.json(): the signature covers the raw body. Stripe has no session to send.
  if (money) app.use('/api', webhookRouter(money));
  // Before express.json() too: a paper is bigger than its limit. The session is checked first.
  app.use('/api', documentsRouter({ verifyToken, read: readDocument, readContract, data, now }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Before the session check: a private key in the browser stands in for sign-in here.
  if (sources) app.use('/api', sourcesRouter(sources, data, now));

  // Everything below requires a valid Supabase session.
  app.use('/api', requireAuth(verifyToken));
  app.use('/api', farmersRouter(repo, data, subsidyParams, now));
  app.use('/api', planRouter(repo, data));
  app.use('/api', recordsRouter(repo, data, subsidyParams, now));
  app.use('/api', functionsRouter(reads));
  app.use('/api', assistantRouter(reads, assistant, assistantDailyLimit));
  app.use('/api', opportunitiesRouter(repo));
  app.use('/api', weatherRouter(repo, weather));
  if (fertilizers) app.use('/api', fertilizersRouter(fertilizers));
  if (plots) app.use('/api', plotsRouter(plots));
  if (lpis) app.use('/api', lpisRouter(lpis));
  if (events) app.use('/api', eventsRouter(repo, events, data, subsidyParams ?? {}, now));
  if (employees) app.use('/api', employeesRouter(repo, employees, now));
  if (arenda) app.use('/api', arendaRouter(repo, arenda, now));
  if (contracts) app.use('/api', contractsRouter(repo, contracts, data, now));
  if (members) app.use('/api', membersRouter({ repo, members, webOrigins: corsOrigins, now }));
  if (money) app.use('/api', moneyRouter(money));
  if (predictions) app.use('/api', predictionsRouter(predictions));

  // Express 5 forwards rejected promises here. Never leak internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
