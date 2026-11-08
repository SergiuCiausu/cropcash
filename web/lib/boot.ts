/* Starts a ported farm-app page in the browser. The old pages loaded each file with a <script>
   tag and talked through globals (FF, CC, CropEngine, Live, React, Recharts). Here the TypeScript is
   imported as modules and handed to those globals, then the page scripts run in the same order
   as before, once the page's HTML is on screen. */
import demoIon from '../../docs/data/demo-ion.json';
import counties from '../../docs/data/counties.json';

type Install = () => Promise<{ default: () => void }>;
const MODULES: Record<string, Install> = {
  shared: () => import('../legacy/shared.js'),
  app: () => import('../legacy/app.js'),
  'data-calls': () => import('../legacy/data-calls.js'),
  'data-sources': () => import('../legacy/data-sources.js'),
  chart: () => import('../legacy/chart.js'),
  'pension-chart': () => import('../legacy/pension-chart.js'),
  papers: () => import('../legacy/papers.js'),
  seasons: () => import('../legacy/seasons.js'),
  notifications: () => import('../legacy/notifications.js'),
  acasa: () => import('../legacy/acasa.js'),
  bani: () => import('../legacy/bani.js'),
  calendar: () => import('../legacy/calendar.js'),
  'date-plan': () => import('../legacy/date-plan.js'),
  login: () => import('../legacy/login.js'),
  onboarding: () => import('../legacy/onboarding.js'),
  oportunitati: () => import('../legacy/oportunitati.js'),
  pensie: () => import('../legacy/pensie.js'),
  prognoza: () => import('../legacy/prognoza.js'),
  recolte: () => import('../legacy/recolte.js'),
  salariu: () => import('../legacy/salariu.js'),
  subventii: () => import('../legacy/subventii.js'),
  surse: () => import('../legacy/surse.js'),
  landing: () => import('../legacy/landing.js'),
};
/* "Întreabă" sits on every page with the app frame, except onboarding, which has no farm yet. */
const assistant = () => import('../legacy/assistant.js');
/* Files the old pages loaded that are now modules set up here. */
const PROVIDED = new Set(['config', 'live', 'engine', 'react', 'recharts', 'inline']);

/* The month Ion's wheat was sown isn't in demo-ion.json. It was in farm-app's app.js. */
const ION_PLANTED: Record<string, string> = { grau: '2026-10' };

/** Ion, the signed-out farm, from docs/data instead of a constant in the page code. */
function ion(cropName: (id: string) => string) {
  const county = counties.counties.find((c) => c.code === demoIon.county);
  const parcels = demoIon.parcels.map((p) => ({ cropId: p.crop_id, areaHa: p.area_ha, ...(ION_PLANTED[p.crop_id] ? { plantedMonth: ION_PLANTED[p.crop_id] } : {}) }));
  const ha = parcels.reduce((s, p) => s + p.areaHa, 0);
  const names = parcels.map((p) => cropName(p.cropId).toLocaleLowerCase('ro'));
  return {
    name: demoIon.name,
    age: demoIon.age,
    county: county?.name_ro ?? demoIon.county,
    region: county?.region_ro ?? null,
    startBalanceBani: demoIon.start_balance_lei * 100,
    summary: `${String(ha).replace('.', ',')} ha, ${names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}` : names[0] ?? ''}`,
    parcels,
  };
}

/* What farm-app took from vendor/ as UMD globals. */
async function loadRecharts(w: Record<string, unknown>) {
  if (w.Recharts) return;
  const [React, ReactDOM, ReactDOMClient, Recharts] = await Promise.all([import('react'), import('react-dom'), import('react-dom/client'), import('recharts')]);
  w.React = React;
  w.ReactDOM = { ...ReactDOM, ...ReactDOMClient };
  w.Recharts = Recharts;
}

let started = false;

export async function boot(scripts: string[], { palette, variant, globals }: { palette?: string; variant?: string; globals?: Record<string, unknown> } = {}) {
  if (started) return;
  started = true;
  const w = window as unknown as Record<string, unknown>;
  Object.assign(w, globals);
  const root = document.documentElement;
  if (palette) root.dataset.defaultPalette = palette;
  if (variant) root.dataset.variant = variant;

  w.CROPCASH_CONFIG = JSON.parse(process.env.NEXT_PUBLIC_CROPCASH_CONFIG ?? '{}');
  if (scripts.includes('engine') || scripts.includes('app')) {
    const engine = await import('./engine');
    w.CropEngine = engine;
    const crops = engine.loadData().crops.crops as { id: string; name_ro: string }[];
    w.__ION = ion((id) => crops.find((c) => c.id === id)?.name_ro ?? id);
  }
  w.Live = await import('./live/index');
  /* The landing page asks for Recharts only when the chart comes near. */
  w.__loadRecharts = () => loadRecharts(w);
  if (scripts.includes('react') || scripts.includes('recharts')) await loadRecharts(w);
  for (const key of scripts) {
    if (PROVIDED.has(key)) continue;
    const load = MODULES[key];
    if (!load) throw new Error(`No ported module for ${key}`);
    (await load()).default();
  }
  if (scripts.includes('app') && !scripts.includes('onboarding')) (await assistant()).default();
}
