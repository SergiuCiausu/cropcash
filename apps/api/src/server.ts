import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

createApp(corsOrigins).listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
