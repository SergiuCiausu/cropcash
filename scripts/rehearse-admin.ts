/*
 * npm run admin:rehearse   (docs/admin-panel-plan.md step 8)
 * The admin panel's rehearsal against the real Supabase, through the routes the phone calls, as the
 * demo account (an admin through its app_roles row, which seed:demo grants; migration 035):
 *   seed:demo → the salary and forecast as they are → publish a new wheat price → the forecast moves,
 *   the salary the server (and Stripe) uses follows → publish a higher wheat cost → the salary drops →
 *   a stale publish is refused (409) → go back a version → go back to where it started.
 * It leaves the version that was in force at the start in force again. Every version it publishes
 * has a note starting "Repetiție:", so they're easy to tell apart in the history.
 * Before publishing, it also reads „Oportunități și surse” the way the tab does (straight from Supabase, as
 * the demo account) and checks it sees every call, the hidden ones too, and every source.
 * Ion's farm without an account (/ferma-lui-ion) never reads any of this; that's checked in the browser.
 */
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { applyOverrides, computeFarmPlan, loadData, type Override } from '../packages/shared/src';
import { createApp } from '../apps/api/src/app';
import { supabaseRepo } from '../apps/api/src/db/repo';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { supabasePredictions } from '../apps/api/src/db/predictions';
import { supabaseTokenVerifier } from '../apps/api/src/middleware/auth';
import { supabaseRoles } from '../apps/api/src/middleware/admin';
import { createDataSource, liveData } from '../apps/api/src/predictions/source';
import { adminCalls, loadAdminMonitor, sourceGroups, supabaseAdminReader } from '../web/lib/cc/admin-opportunities';

const env = process.env as Record<string, string>;
const files = loadData();
const wheat = files.crops.crops.find((c) => c.id === 'grau')!;
const PRICE = 'crops.crops[id=grau].price_lei_per_kg.mean';
const COST = 'crops.crops[id=grau].cost_lei_per_ha.mean';

const lei = (bani: number) => Math.round(bani / 100).toLocaleString('ro-RO');
const fail = (msg: string): never => {
  throw new Error(msg);
};
const check = (ok: boolean, msg: string) => {
  if (!ok) fail(msg);
  console.log(`  ✓ ${msg}`);
};

async function main() {
  const t0 = Date.now();
  console.log('seed:demo…');
  execSync('npm run seed:demo', { stdio: 'ignore' });

  const db = supabaseFactory(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY);
  const store = supabasePredictions(db.admin());
  const source = createDataSource({ store });
  await source.refresh();
  const app = createApp({
    corsOrigins: [],
    verifyToken: supabaseTokenVerifier(env.SUPABASE_URL),
    repo: supabaseRepo(db),
    data: liveData(source),
    predictions: { store, source, roles: supabaseRoles(db) },
  });

  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await c.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
  if (error) throw error;
  const isAdmin = await c.rpc('is_admin');
  if (isAdmin.error) throw isAdmin.error;
  if (isAdmin.data !== true) fail('the demo account has no admin row in app_roles: it cannot open the panel (seed:demo grants it)');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, path: string, body?: object, expect = [200, 201]) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session!.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!expect.includes(res.status)) fail(`${method} ${path} → ${res.status} ${text}`);
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const get = async (path: string) => (await call('GET', path)).body;
  /** What the server works out for the demo farm: the salary and the money left at the end of the plan. */
  const figures = async () => {
    const salary = (await call('POST', '/functions/get_salary', { scenario: 'medium' })).body.data.salary as number;
    const me = (await get('/me')).farmer;
    const plan = computeFarmPlan(me, liveData(source));
    const end = plan.timelines.medium.months.at(-1)!.balanceEnd;
    return { salary, end, me };
  };

  const start = await get('/prediction-data');
  check(start.admin === true, `the demo account is an admin (version in force: ${start.version}, ${start.overrides.length} changes)`);
  const startSet: Override[] = start.overrides;
  const inForce = (path: string) => startSet.find((o) => o.path === path)?.value as number | undefined;
  const factors = await get('/admin/factors');
  check(factors.factors.some((f: { path: string }) => f.path === PRICE), `/admin/factors lists ${factors.factors.length} figures, wheat's price among them`);

  // „Oportunități și surse” (docs/admin-opportunities-plan.md step 7): read as the tab reads it, straight from
  // Supabase with the demo account's session, and compared with what the service key sees.
  const monitor = await loadAdminMonitor(supabaseAdminReader(c), new Date());
  const all = async (table: string, filter?: [string, string]) => {
    let q = db.admin().from(table).select('*', { count: 'exact', head: true });
    if (filter) q = q.eq(...filter);
    const { count, error: e } = await q;
    if (e) throw e;
    return count ?? 0;
  };
  const [calls, hidden, sourcesCount] = await Promise.all([all('opportunities'), all('opportunities', ['relevance', 'not_relevant']), all('sources')]);
  check(monitor.opportunities.length > 0 && monitor.opportunities.length === calls, `the tab reads every funding call (${calls})`);
  check(monitor.opportunities.filter((o) => o.relevance === 'not_relevant').length === hidden, `including the ${hidden} farmers never see`);
  check(monitor.sources.length > 0 && monitor.sources.length === sourcesCount, `and every official source (${sourcesCount}), ${sourceGroups(monitor.sources).filter((g) => g.problem).reduce((n, g) => n + g.sources.length, 0)} of them with problems`);
  check(adminCalls(monitor.opportunities, {}, new Date().toISOString().slice(0, 10)).length === calls, 'the list shows them all before any filter');

  let version = start.version as number;
  const publish = async (overrides: Override[], note: string) => {
    const r = await call('POST', '/admin/publish', { baseVersion: version, note: `Repetiție: ${note}`, overrides });
    version = r.body.version;
    return version;
  };
  const without = (path: string) => startSet.filter((o) => o.path !== path);

  try {
    const before = await figures();
    console.log(`\nAcum: salariul ${lei(before.salary)} lei/lună, la finalul planului ${lei(before.end)} lei`);

    // 1. Wheat's price up, as an admin would after a new market report.
    const price = Math.min(wheat.price_lei_per_kg.max, +(((inForce(PRICE) ?? wheat.price_lei_per_kg.mean) + 0.1).toFixed(2)));
    const withPrice = [...without(PRICE), { path: PRICE, value: price, reason: 'Repetiție: preț nou la grâu' }];
    const v1 = await publish(withPrice, `grâul la ${price} lei/kg`);
    const afterPrice = await figures();
    console.log(`\nVersiunea ${v1}: grâul la ${String(price).replace('.', ',')} lei/kg`);
    console.log(`  salariul ${lei(afterPrice.salary)} lei/lună, la finalul planului ${lei(afterPrice.end)} lei`);
    check((await get('/prediction-data')).version === v1, 'the phone reads the new version from /api/prediction-data');
    check(afterPrice.end > before.end, 'Prognoză: more money at the end of the plan (the wheat is sold for more)');
    const onPhone = computeFarmPlan(afterPrice.me, applyOverrides(withPrice)).salary.salary;
    check(onPhone === afterPrice.salary, `the phone works out the same salary as the server (${lei(onPhone)} lei), so Stripe pays what the screen shows`);

    // 2. Wheat's cost up: this one lowers the salary (the limit falls before the harvest).
    const cost = wheat.cost_lei_per_ha.max;
    const withCost = [...withPrice.filter((o) => o.path !== COST), { path: COST, value: cost, reason: 'Repetiție: costuri mai mari' }];
    const v2 = await publish(withCost, `costul grâului ${cost} lei/ha`);
    const afterCost = await figures();
    console.log(`\nVersiunea ${v2}: costul grâului ${cost} lei/ha`);
    console.log(`  salariul ${lei(afterCost.salary)} lei/lună, la finalul planului ${lei(afterCost.end)} lei`);
    check(afterCost.salary < afterPrice.salary, 'Salariu: the salary drops with the higher cost');

    // 3. A second admin who opened the panel before v2 can't overwrite it.
    const stale = await call('POST', '/admin/publish', { baseVersion: v1, note: 'Repetiție: ciornă veche', overrides: withPrice }, [409]);
    check(stale.body.current === v2 && stale.body.sameAsYours === false, `a publish from an older version is refused (409, version ${v2} stays in force)`);

    // 4. Go back one version.
    const back = (await call('POST', `/admin/revert/${v1}`, { baseVersion: v2, note: `Repetiție: înapoi la ${v1}` })).body.version as number;
    version = back;
    const afterBack = await figures();
    check(afterBack.salary === afterPrice.salary && afterBack.end === afterPrice.end, `back to version ${v1} as version ${back}: the figures are those of version ${v1} again`);
    const history = (await get('/admin/versions')).versions as { version: number; revertedFrom: number | null }[];
    check(history[0]!.version === back && history[0]!.revertedFrom === v1, 'the history shows the new version, and that it went back to an older one');
  } finally {
    // 5. Leave it as it was: the starting set in force again.
    try {
      const now = (await get('/prediction-data')).version;
      if (now !== start.version) {
        version = now;
        const restored = start.version > 0 ? (await call('POST', `/admin/revert/${start.version}`, { baseVersion: now, note: `Repetiție: înapoi la ${start.version}, ca la început` })).body.version : await publish([], 'înapoi la cifrele din surse, ca la început');
        console.log(`\nLa final: versiunea ${restored}, cu cifrele de la început`);
      }
      const end = await figures();
      const first = computeFarmPlan(end.me, start.version > 0 ? applyOverrides(startSet) : files).salary.salary;
      check(end.salary === first, 'the figures in force are the ones from the start');
    } finally {
      server.close();
    }
  }
  console.log(`\nGata în ${Math.round((Date.now() - t0) / 1000)} s.`);
}

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`);
  process.exit(1);
});
