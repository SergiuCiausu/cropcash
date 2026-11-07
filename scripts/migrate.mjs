// Applies supabase/migrations/*.sql in order, once each, tracked in public._migrations.
// Usage: npm run db:migrate   (reads SUPABASE_DB_URL from .env)
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set (see .env.example)');
  process.exit(1);
}

const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(
    'create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  await client.query('alter table public._migrations enable row level security');
  const done = new Set((await client.query('select name from public._migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public._migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`${file}: ${err.message}`);
    }
  }
  console.log('migrations up to date');
} finally {
  await client.end();
}
