/* The farm app as one Next.js app. Static export: the Express API (apps/api) stays the server,
   so `next build` writes plain files to web/out, like farm-app did. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { publicConfig } from './lib/live/public-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // Hosted builds set these in the environment.
}

/* The only values that reach the browser. publicConfig refuses a secret key. */
const config = publicConfig(process.env);

const nextConfig: NextConfig = {
  output: 'export',
  // /salariu is written as salariu.html, so the pages work from any static host.
  trailingSlash: false,
  // The legacy page scripts run once per page load and move DOM nodes; a double run would duplicate them.
  reactStrictMode: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_CROPCASH_CONFIG: JSON.stringify(config) },
  // packages/shared and docs/data live outside web/.
  turbopack: { root },
  outputFileTracingRoot: root,
  typescript: { ignoreBuildErrors: true }, // checked by `npm run typecheck` (TypeScript 7)
};

export default nextConfig;
