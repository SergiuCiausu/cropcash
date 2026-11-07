import express from 'express';
import cors from 'cors';

export function createApp(corsOrigins: string[]) {
  const app = express();

  app.use(cors({ origin: corsOrigins }));
  // Note: the Stripe webhook route (step 6) must be mounted BEFORE express.json(),
  // because signature verification needs the raw body.
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
