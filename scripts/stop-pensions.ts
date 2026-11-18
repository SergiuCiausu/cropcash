/*
 * npm run pensions:stop [-- --apply]
 *
 * Step 1 of docs/remove-pension-plan.md, run once before any pension code is removed: cancels every pension
 * subscription in Stripe (test mode), marks the plans stopped, moves each pension envelope into the salary
 * envelope, and fixes those farms' salaries again without the pension. Without --apply it only prints what it
 * would do. Safe to run again: a second run finds nothing left to do.
 *
 * Needs in .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL,
 * STRIPE_SECRET_KEY (sk_test_).
 */
import pg from 'pg';
import { loadData } from '../packages/shared/src';
import { supabaseAdminRepo } from '../apps/api/src/db/admin';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { stopPensionsStore } from '../apps/api/src/db/stop-pensions';
import { createStripe } from '../apps/api/src/stripe/money';
import { stopPensions } from '../apps/api/src/stripe/stop-pensions';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (see .env.example)`);
  return v;
};

const apply = process.argv.includes('--apply');
const stripe = createStripe(need('STRIPE_SECRET_KEY'));
const sb = supabaseFactory(need('SUPABASE_URL'), need('SUPABASE_ANON_KEY'), need('SUPABASE_SERVICE_ROLE_KEY')).admin();

let client: pg.Client | null = null;
const db = async () => {
  if (!client) {
    client = new pg.Client({ connectionString: need('SUPABASE_DB_URL'), ssl: { rejectUnauthorized: false } });
    await client.connect();
  }
  return client;
};

console.log(apply ? 'Stopping pensions (--apply).' : 'Dry run: nothing is changed. Run with --apply to do it.');
try {
  const reports = await stopPensions(
    { stripe, store: stopPensionsStore(sb, supabaseAdminRepo(sb), db), data: loadData() },
    { dryRun: !apply, log: (msg) => console.log(`  ${msg}`) },
  );
  const busy = reports.filter((r) => r.skipped === 'busy');
  const cancelled = reports.reduce((n, r) => n + r.cancelled.length, 0);
  const moved = reports.reduce((n, r) => n + r.movedBani, 0);
  const salaries = reports.filter((r) => r.salaryAfter !== r.salaryBefore).length;
  console.log(
    `${reports.length} farm(s) looked at · ${cancelled} subscription(s) ${apply ? 'cancelled' : 'to cancel'} · ` +
      `${moved} bani ${apply ? 'moved' : 'to move'} to salary · ${salaries} salar${salaries === 1 ? 'y' : 'ies'} ${apply ? 'fixed' : 'to fix'}`,
  );
  if (busy.length) {
    console.log(`${busy.length} farm(s) were busy with another money operation: run again.`);
    process.exitCode = 1;
  }
} finally {
  // Set inside db(), which TypeScript can't follow from here.
  await (client as pg.Client | null)?.end();
}
