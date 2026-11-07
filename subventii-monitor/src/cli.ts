import fs from 'node:fs';
import { SPEC_PATH, loadSupabase, loadUserAgent } from './config.ts';
import { Fetcher } from './fetcher.ts';
import { fetchEcCalls } from './opportunities/ec-api.ts';
import { writeReport } from './report/write.ts';
import { runChecks } from './run.ts';
import { parseSpec } from './seed.ts';
import { SupabaseStore } from './supabase-store.ts';
import { installCertificates } from './tls-setup.ts';

installCertificates();
const { url, secretKey } = loadSupabase();
const store = new SupabaseStore(url, secretKey);
const command = process.argv[2];

async function report(runId?: number): Promise<void> {
  const run = await store.runStats(runId);
  if (!run) throw new Error('No finished run to report on.');
  console.log(`Report written to ${await writeReport(store, run)}`);
}

if (command === 'seed') {
  const sources = parseSpec(fs.readFileSync(SPEC_PATH, 'utf8'));
  await store.upsertSources(sources);
  console.log(`Parsed ${sources.length} sources from the spec; ${await store.countSources()} in the database`);
} else if (command === 'run') {
  const userAgent = loadUserAgent();
  const fetcher = new Fetcher({ userAgent, robotsCache: store.robotsCache() });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const summary = await runChecks(store, fetcher, console.log, now, () => fetchEcCalls(userAgent, today));
  console.log(JSON.stringify(summary, null, 2));
  await report(summary.runId);
} else if (command === 'report') {
  await report(process.argv[3] ? Number(process.argv[3]) : undefined);
} else {
  console.error('Usage: tsx src/cli.ts <seed|run|report [runId]>');
  process.exitCode = 1;
}
