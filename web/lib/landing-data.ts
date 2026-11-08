/* The farm on the landing page: Ion, from docs/data/demo-ion.json, run through the same engine
   as the app (buildFarmPlan), at build time. It replaces the "Dealu Verde" sample that lived in
   farm-app/mobile/shared.js. Every figure here comes from docs/data through packages/shared. */
import demoIon from '../../docs/data/demo-ion.json';
import { loadData } from '../../packages/shared/src/data/index';
import { buildFarmPlan, farmData, grainInBarn } from '../../packages/shared/src/functions/plan';
import { harvestYear } from '../../packages/shared/src/farm/index';
import { group } from './cc/format';

const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const PATHS = { poor: 'bad', expected: 'medium', good: 'good' } as const;

export interface LandingTx { ic: string; tone: string; name: string; sub: string; bani: number; date: string; status?: string }
export interface LandingCrop { n: string; ha: number; mv: number; m: string; t: string; price: string; inc: string; state: string }
export interface LandingFigures {
  name: string;
  ha: number;
  start: number;
  months: { short: string; long: string }[];
  endLabel: string;
  series: Record<keyof typeof PATHS, number[]>;
  flows: Record<keyof typeof PATHS, { in: number; out: number }[]>;
  costs: [string, string, number][];
  crops: LandingCrop[];
  coming: LandingTx[];
  income: { name: string; bani: number }[];
  salary: number;
}

const num = (v: number) => String(v).replace('.', ',');
const day = (iso: string) => `${+iso.slice(8, 10)} ${SHORT[+iso.slice(5, 7) - 1]}`;
const COST_ICON: [RegExp, string][] = [[/îngrășăm/, 'sack'], [/tratament|erbicid/, 'spray'], [/recolt/, 'tool'], [/arat|teren/, 'map'], [/sămânț|semănat/, 'seed']];
const costIcon = (what: string) => COST_ICON.find(([re]) => re.test(what))?.[1] ?? 'drop';
const sentence = (s: string) => s.charAt(0).toLocaleUpperCase('ro') + s.slice(1);

export function landingFigures(): LandingFigures {
  const today = demoIon.demo_start.value;
  const month = `${harvestYear(today) - 1}-11`;
  const data = farmData({ harvests: { years: [], gathered: [], expected: [] } } as never, loadData());
  const crops = data.crops.crops;
  const cropOf = (id: string) => crops.find((c) => c.id === id)!;
  const farm = {
    birth_year: +today.slice(0, 4) - demoIon.age,
    start_balance_bani: demoIon.start_balance_lei * 100,
    parcels: demoIon.parcels.map((p) => ({ crop_id: p.crop_id, area_ari: Math.round(p.area_ha * 100), is_arable: true, ...(p.planted_month ? { planted_month: p.planted_month } : {}) })),
    transactions: [],
    stored_grain: grainInBarn([], [], data),
    pension_plans: { monthly_bani: data.params.pension_demo_lei.value * 100, status: 'active' },
    apia_decision: null,
  };
  const plan = buildFarmPlan(farm as never, data, { month });
  const medium = plan.timelines.medium.months.slice(0, 12);

  const series = {} as LandingFigures['series'];
  const flows = {} as LandingFigures['flows'];
  for (const [path, key] of Object.entries(PATHS) as [keyof typeof PATHS, 'bad' | 'medium' | 'good'][]) {
    const months = plan.timelines[key].months.slice(0, 12);
    series[path] = months.map((m) => m.balanceEnd);
    flows[path] = months.map((m) => ({ in: m.in, out: m.out }));
  }
  const last = medium[medium.length - 1]!.key;

  /* What the season costs, by the job the money is for (crops-reference expense_months). */
  const byWhat = new Map<string, number>();
  for (const p of demoIon.parcels) {
    const c = cropOf(p.crop_id);
    for (const e of c.expense_months) byWhat.set(e.what_ro, (byWhat.get(e.what_ro) ?? 0) + Math.round((c.cost_lei_per_ha.mean * p.area_ha * e.share_pct) / 100));
  }
  const costs = [...byWhat].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([what, lei]) => [costIcon(what), sentence(what), lei] as [string, string, number]);

  /* What a hectare leaves after its costs, on the average yield and price. */
  const cropRows = demoIon.parcels.map((p) => {
    const c = cropOf(p.crop_id);
    const tonnes = c.yield_t_per_ha.mean * p.area_ha;
    const income = Math.round(tonnes * c.price_lei_per_kg.mean * 1000);
    const mv = Math.round(c.yield_t_per_ha.mean * c.price_lei_per_kg.mean * 1000 - c.cost_lei_per_ha.mean);
    return { n: c.name_ro, ha: p.area_ha, mv, m: `${group(mv)} lei`, t: `${num(tonnes)} t`, price: `${group(c.price_lei_per_kg.mean * 1000)} lei / t`, inc: `${group(income)} lei`, state: 'Estimat' };
  }).sort((a, b) => b.mv - a.mv);

  /* What comes next, in the order the plan has it. */
  const name = (e: (typeof medium)[number]['entries'][number]) => {
    const crop = e.cropId ? cropOf(e.cropId).name_ro : '';
    if (e.kind === 'apia_advance') return ['bank', 'Avansul de la APIA', 'Subvenție'];
    if (e.kind === 'apia_balance') return ['bank', 'Restul de la APIA', 'Subvenție'];
    if (e.kind === 'crop_sale') return ['sprout', `Vânzare ${crop.toLocaleLowerCase('ro')}`, 'Recoltă'];
    if (e.kind === 'input_cost') return [costIcon(e.what ?? ''), `${crop}: ${e.what ?? ''}`, 'Cheltuială'];
    return null;
  };
  const coming: LandingTx[] = [];
  for (const m of medium) for (const e of m.entries) {
    const n = e.value > 0 ? name(e) : null;
    if (!n || coming.length >= 4) continue;
    const when = e.date;
    coming.push({ ic: n[0]!, tone: e.direction === 'in' ? 'b' : 'c', name: n[1]!, sub: n[2]!, bani: e.direction === 'in' ? e.value : -e.value, date: day(when), ...(e.estimated || e.direction === 'in' ? { status: 'Estimat' } : {}) });
  }

  /* Where the year's money comes from, which the salary spreads over the months. */
  const income = new Map<string, number>();
  for (const m of medium) for (const e of m.entries) {
    if (e.direction !== 'in' || !e.value) continue;
    const key = e.kind.startsWith('apia') ? 'APIA' : e.cropId ? cropOf(e.cropId).name_ro : 'Altele';
    income.set(key, (income.get(key) ?? 0) + e.value);
  }

  return {
    name: demoIon.name,
    ha: demoIon.parcels.reduce((s, p) => s + p.area_ha, 0),
    start: plan.timelines.medium.startBalance,
    months: medium.map((m) => ({ short: SHORT[+m.key.slice(5, 7) - 1]!, long: LONG[+m.key.slice(5, 7) - 1]! })),
    endLabel: `Sfârșitul lui ${LONG[+last.slice(5, 7) - 1]} ${last.slice(0, 4)}`,
    series,
    flows,
    costs,
    crops: cropRows,
    coming,
    income: [...income].map(([n, bani]) => ({ name: n, bani })).sort((a, b) => b.bani - a.bani).slice(0, 3),
    salary: plan.salary.salary,
  };
}
