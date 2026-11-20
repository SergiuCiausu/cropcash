/* Shared bits of the geo import (docs/harta-plan.md, step 1b): where raw downloads go, polite fetching
   with retries, and the database connection. Run by hand, never by the app. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';

export const ROOT = join(import.meta.dirname, '..', '..');
/** Raw downloads, gitignored, so a failed run resumes instead of starting over. */
export const CACHE = join(ROOT, 'data-cache');
export const DATA = join(ROOT, 'docs', 'data');

/** A generic client name: public services ask automated clients to say what they are. */
export const USER_AGENT = 'cropcash-geo-import/0.1 (one-off reference import)';

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET or POST with retries and backoff (2 s, 4 s, 8 s, 16 s, 32 s). Throws after the last one. */
export async function politeFetch(url: string, init: RequestInit = {}, tries = 6): Promise<Response> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(180_000) });
      if (res.ok) return res;
      last = new Error(`${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) throw last;
    } catch (e) {
      last = e;
    }
    await wait(2000 * 2 ** i);
  }
  throw last;
}

/**
 * The text of a JSON answer, with the same retries. ArcGIS answers some failures with HTTP 200: an HTML page
 * („Could not access any server machines”) or `{"error": …}`. Those are retried, never returned, so they are
 * never cached as if they were data.
 */
export async function politeJsonText(url: string, init: RequestInit = {}, tries = 6): Promise<string> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    const text = await (await politeFetch(url, init)).text();
    try {
      const body: unknown = JSON.parse(text);
      if (body && typeof body === 'object' && 'error' in body) throw new Error(`ArcGIS error: ${JSON.stringify((body as { error: unknown }).error).slice(0, 200)}`);
      return text;
    } catch (e) {
      last = e instanceof SyntaxError ? new Error(`not JSON (${text.replace(/<[^>]*>|\s+/g, ' ').trim().slice(-120)})`) : e;
      console.warn(`\n${(last as Error).message}; trying again`);
    }
    await wait(5000 * 2 ** i);
  }
  throw last;
}

/** Reads a cached file, or fetches it once and keeps it. */
export async function cachedText(file: string, fetchIt: () => Promise<string>): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    const text = await fetchIt();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    return text;
  }
}

/** The database the import writes to: SUPABASE_DB_URL. Point it at a dev database (open question 1). */
export async function db(): Promise<pg.Client> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set (see .env.example)');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

export const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : (process.argv[i + 1] ?? '');
};
export const flag = (name: string) => process.argv.includes(`--${name}`);

/** The counties the import covers: --county TR, or both. */
export function counties(): string[] {
  const one = arg('county');
  return one ? [one.toUpperCase()] : ['TR', 'CT'];
}
