/*
 * npm run seed:demo — puts Ion's demo account back at the start of the pitch (docs/09 §3):
 * farm onboarded, Stripe account + Test Clock at demo_start, APIA advance NOT yet paid,
 * no pension. Safe to run again and again: the old account, its Stripe objects and all
 * its rows (cascade) are removed first.
 *
 * Needs in .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * STRIPE_SECRET_KEY (sk_test_), DEMO_EMAIL, DEMO_PASSWORD.
 */
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadData } from '../packages/shared/src';
import { createApp } from '../apps/api/src/app';
import { supabaseRepo } from '../apps/api/src/db/repo';
import { supabaseAdminRepo } from '../apps/api/src/db/admin';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { supabaseTokenVerifier } from '../apps/api/src/middleware/auth';
import { createStripe, MoneyService } from '../apps/api/src/stripe/money';

const t0 = Date.now();
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (see .env.example)`);
  return v;
};
const env = {
  url: need('SUPABASE_URL'),
  anon: need('SUPABASE_ANON_KEY'),
  service: need('SUPABASE_SERVICE_ROLE_KEY'),
  stripe: need('STRIPE_SECRET_KEY'),
  email: need('DEMO_EMAIL'),
  password: need('DEMO_PASSWORD'),
};
const ion = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'docs', 'data', 'demo-ion.json'), 'utf8'));
const step = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const data = loadData();
const db = supabaseFactory(env.url, env.anon, env.service);
const sb = db.admin();
const admin = supabaseAdminRepo(sb);
const stripe = createStripe(env.stripe);
const money = new MoneyService(stripe, admin, data);

// 1. Remove the previous demo account (Stripe objects first, then the user; rows cascade).
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const old = list.users.find((u) => u.email?.toLowerCase() === env.email.toLowerCase());
if (old) {
  const farm = await admin.farmByUser(old.id);
  if (farm?.test_clock_id) await stripe.testHelpers.testClocks.del(farm.test_clock_id).catch(() => {});
  if (farm?.stripe_account_id) {
    await stripe.v2.core.accounts.close(farm.stripe_account_id, { applied_configurations: ['recipient'] }).catch(() => {});
  }
  const { error } = await sb.auth.admin.deleteUser(old.id);
  if (error) throw error;
  step(`removed the old demo account (${env.email})`);
}

// 2. Fresh user, logged in like the app does.
const { data: created, error: createErr } = await sb.auth.admin.createUser({
  email: env.email,
  password: env.password,
  email_confirm: true,
});
if (createErr) throw createErr;
const client = createClient(env.url, env.anon, { auth: { persistSession: false } });
const { data: session, error: loginErr } = await client.auth.signInWithPassword({ email: env.email, password: env.password });
if (loginErr) throw loginErr;
step('created the user');

// 3. Onboarding through the real API route (same validation as the phone).
const app = createApp({
  corsOrigins: [],
  verifyToken: supabaseTokenVerifier(env.url),
  repo: supabaseRepo(db),
  data,
});
const server = app.listen(0);
try {
  const port = (server.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/farmers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session!.access_token}` },
    body: JSON.stringify({
      name: ion.name,
      county: ion.county,
      age: ion.age,
      startBalanceLei: ion.start_balance_lei,
      parcels: ion.parcels.map((p: { crop_id: string; area_ha: number }) => ({ cropId: p.crop_id, areaHa: p.area_ha })),
    }),
  });
  if (res.status !== 201) throw new Error(`onboarding failed: ${res.status} ${await res.text()}`);
} finally {
  server.close();
}
step('onboarded the farm');

// 4. Stripe account, Test Clock at the demo start, customer for the pension.
const farm = await admin.farmByUser(created.user.id);
if (!farm) throw new Error('farm not found after onboarding');
const startAt = Math.floor(Date.parse(`${ion.demo_start.value}T09:00:00Z`) / 1000);
const ready = await money.setup(farm, env.email, '127.0.0.1', startAt);
step(`Stripe ready: ${ready.stripe_account_id}, clock ${ready.test_clock_id} at ${ready.demo_now}`);

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. Log in as ${env.email}.`);
