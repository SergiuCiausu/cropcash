/* Starts the landing page, the one page still drawn by scripts (legacy/shared.js and landing.js; the
   app pages are React, docs/web-react-port-plan.md N5). Its figures come from docs/data at build time
   and reach the scripts as globals. */
import { markReady } from './ui/ready';

type Install = () => Promise<{ default: () => void }>;
const MODULES: Record<string, Install> = {
  shared: () => import('../legacy/shared.js'),
  landing: () => import('../legacy/landing.js'),
};

async function loadRecharts(w: Record<string, unknown>) {
  if (w.Recharts) return;
  const [React, ReactDOM, ReactDOMClient, Recharts] = await Promise.all([import('react'), import('react-dom'), import('react-dom/client'), import('recharts')]);
  w.React = React;
  w.ReactDOM = { ...ReactDOM, ...ReactDOMClient };
  w.Recharts = Recharts;
}

let started = false;

export async function boot(scripts: string[], { variant, globals }: { variant?: string; globals?: Record<string, unknown> } = {}) {
  if (started) return;
  started = true;
  const w = window as unknown as Record<string, unknown>;
  Object.assign(w, globals);
  if (variant) document.documentElement.dataset.variant = variant;
  /* landing.js asks whether a session is saved, to change its buttons. */
  w.Live = await import('./live/index');
  /* The landing page asks for Recharts only when the chart comes near. */
  w.__loadRecharts = () => loadRecharts(w);
  for (const key of scripts) {
    const load = MODULES[key];
    if (!load) throw new Error(`No script called ${key}`);
    (await load()).default();
  }
  markReady();
}
