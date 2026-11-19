/*
 * Demo-deck helper: takes the credit the app suggests for Ion, through the running API
 * (localhost:3001), exactly as scripts/rehearse-demo.ts does. The web app has no button
 * for it, so the deck records the APIA advance, runs this, then records the pension and
 * the six months forward. Figures come from computeFarmPlan, never from here.
 * Run: node --env-file=.env ./node_modules/tsx/dist/cli.mjs pptx/take-credit.ts
 */
import { createClient } from '@supabase/supabase-js';
import { computeFarmPlan, loadData } from '../packages/shared/src';

const env = process.env as Record<string, string>;
const base = (env.VITE_API_URL || 'http://localhost:3001') + '/api';
const data = loadData();

const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s, error } = await c.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
if (error) throw error;

const call = async (method: string, path: string, body?: object) => {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${s.session!.access_token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const plan = computeFarmPlan((await call('GET', '/me')).farmer, data);
const sug = plan.creditSuggestion;
if (!sug?.credit.takeMonth) throw new Error('no credit suggestion: record the APIA advance first');
const take = sug.credit.takeMonth;
const [y, m] = take.split('-').map(Number) as [number, number];
const repay = `${m + 7 > 12 ? y + 1 : y}-${String(((m + 6) % 12) + 1).padStart(2, '0')}`;
await call('POST', '/credits', { amountLei: sug.credit.amount / 100, takeMonth: take, repayMonth: repay });
console.log(`credit taken: ${sug.credit.amount / 100} lei in ${take}, back in ${repay}; salary with credit ${sug.salary / 100} lei`);
