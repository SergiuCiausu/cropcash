/* Filters and sorting for the parcel list and the map, and their form in the URL
   (/harta?cultura=grau&recolta=2027-07..2027-08), so a filtered view can be shared or linked. */
import { haToAri, leiToBani, type Bani } from '../money';
import { OPERATION_KINDS, TREATMENT_KINDS, type GeometrySource, type OperationKind } from './model';
import { dueWithin } from './operations';
import { cropKeyOf, UNKNOWN_CROP, type PlotRow } from './rows';

export type ValueRange<T> = { min?: T; max?: T };
export type MoneyRange = ValueRange<Bani> & { perHa: boolean };
export type MonthRange = { from?: string; to?: string };
export type Placement = 'placed' | 'approx' | 'none';

export interface PlotFilters {
  crops?: string[];
  sizeAri?: ValueRange<number>;
  revenue?: MoneyRange;
  expenses?: MoneyRange;
  result?: MoneyRange;
  /** 'some' / 'none' plant protection done, or every listed kind done. */
  treatmentsDone?: 'some' | 'none' | OperationKind[];
  todo?: 'any' | 'overdue' | 'soon';
  sown?: MonthRange;
  harvest?: MonthRange;
  /** Commune or village codes; a parcel matches on either. */
  siruta?: number[];
  /** Part of the bloc, parcel number or the farmer's name for it. */
  text?: string;
  placement?: Placement[];
  landUse?: string[];
  cropChanged?: boolean;
}

export const placementOf = (source: GeometrySource): Placement =>
  source === 'approx' ? 'approx' : source === 'none' ? 'none' : 'placed';

const inRange = (v: number | null | undefined, r: ValueRange<number> | undefined) =>
  !r || (v != null && (r.min == null || v >= r.min) && (r.max == null || v <= r.max));

const inMonths = (m: string | null | undefined, r: MonthRange | undefined) =>
  !r || (!!m && (!r.from || m >= r.from) && (!r.to || m <= r.to));

function moneyOk(row: PlotRow, r: MoneyRange | undefined, pick: (m: NonNullable<PlotRow['money']>, perHa: boolean) => number | null) {
  if (!r) return true;
  return inRange(row.money ? pick(row.money, r.perHa) : null, r);
}

/** `soonDays` comes from plots-params.json (todo_soon_days). */
export function matchesFilters(row: PlotRow, f: PlotFilters, today: string, soonDays: number): boolean {
  if (f.crops?.length && !f.crops.includes(cropKeyOf(row))) return false;
  if (!inRange(row.season?.area_ari, f.sizeAri)) return false;
  if (!moneyOk(row, f.revenue, (m, ha) => (ha ? (m.perHa?.revenue ?? null) : m.revenue.total))) return false;
  if (!moneyOk(row, f.expenses, (m, ha) => (ha ? (m.perHa?.expenses ?? null) : m.expenses.total))) return false;
  if (!moneyOk(row, f.result, (m, ha) => (ha ? (m.perHa?.result ?? null) : m.result))) return false;

  if (f.treatmentsDone) {
    const kinds = new Set(row.operations.done.map((o) => o.kind));
    const anyTreatment = TREATMENT_KINDS.some((k) => kinds.has(k));
    if (f.treatmentsDone === 'some' && !anyTreatment) return false;
    if (f.treatmentsDone === 'none' && anyTreatment) return false;
    if (Array.isArray(f.treatmentsDone) && !f.treatmentsDone.every((k) => kinds.has(k))) return false;
  }
  if (f.todo === 'any' && row.operations.todo.length === 0) return false;
  if (f.todo === 'overdue' && row.operations.overdue.length === 0) return false;
  if (f.todo === 'soon' && !dueWithin(row.operations.next, today, soonDays)) return false;

  if (!inMonths(row.sowing?.month, f.sown)) return false;
  if (!inMonths(row.harvest?.month, f.harvest)) return false;
  if (f.siruta?.length && !f.siruta.some((c) => c === row.plot.siruta || c === row.plot.village_siruta)) return false;
  if (f.text) {
    const needle = f.text.trim().toLowerCase();
    const hay = [row.plot.bloc_fizic, row.plot.parcel_no, row.plot.name, row.plot.lpis_fbid].filter(Boolean).join(' ').toLowerCase();
    if (needle && !hay.includes(needle)) return false;
  }
  if (f.placement?.length && !f.placement.includes(placementOf(row.plot.geometry_source))) return false;
  if (f.landUse?.length && !f.landUse.includes(row.plot.land_use ?? '')) return false;
  if (f.cropChanged !== undefined) {
    const before = row.previous?.crop_id;
    if (!row.season || before === undefined) return false;
    if ((before !== row.season.crop_id) !== f.cropChanged) return false;
  }
  return true;
}

export function filterPlots(rows: readonly PlotRow[], f: PlotFilters, today: string, soonDays: number): PlotRow[] {
  return rows.filter((r) => matchesFilters(r, f, today, soonDays));
}

export const isEmptyFilter = (f: PlotFilters) => Object.values(f).every((v) => v === undefined);

export const SORT_KEYS = ['name', 'size', 'result_ha', 'expenses', 'harvest', 'next_treatment'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The farmer's name for it, else bloc and parcel number, so the order is stable and readable. */
const nameKey = (r: PlotRow) => (r.plot.name ?? `${(r.plot.bloc_fizic ?? '').padStart(8, '0')} ${r.plot.parcel_no ?? ''}`).toLowerCase();

/** Rows with no value for the key go last, whatever the direction. */
export function sortPlots(rows: readonly PlotRow[], key: SortKey, dir: 'asc' | 'desc' = 'asc'): PlotRow[] {
  const value = (r: PlotRow): string | number | null => {
    switch (key) {
      case 'name':
        return nameKey(r);
      case 'size':
        return r.season?.area_ari ?? null;
      case 'result_ha':
        return r.money?.perHa?.result ?? null;
      case 'expenses':
        return r.money?.expenses.total ?? null;
      case 'harvest':
        return r.harvest?.month ?? null;
      case 'next_treatment':
        return r.operations.overdue[0]?.due ?? r.operations.next?.due ?? null;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? nameKey(a).localeCompare(nameKey(b)) : va === null ? 1 : -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return c !== 0 ? c * sign : nameKey(a).localeCompare(nameKey(b));
  });
}

// ── The URL form ────────────────────────────────────────────────────────────

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PLACEMENTS: Record<string, Placement> = { harta: 'placed', aproximativ: 'approx', fara: 'none' };
const TODO: Record<string, PlotFilters['todo']> = { oricare: 'any', intarziate: 'overdue', curand: 'soon' };
const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

function parseRange(v: string, unit: (n: number) => number): ValueRange<number> | undefined {
  const [a, b] = v.split('..');
  if (b === undefined) return undefined;
  const num = (s: string | undefined) => (s && Number.isFinite(Number(s)) ? unit(Number(s)) : undefined);
  const r = { min: num(a), max: num(b) };
  return r.min === undefined && r.max === undefined ? undefined : r;
}

function parseMoney(v: string): MoneyRange | undefined {
  const perHa = v.endsWith('/ha');
  const r = parseRange(perHa ? v.slice(0, -3) : v, leiToBani);
  return r && { ...r, perHa };
}

function parseMonths(v: string): MonthRange | undefined {
  const [a, b] = v.split('..');
  const r = { from: a && MONTH.test(a) ? a : undefined, to: b && MONTH.test(b) ? b : undefined };
  return b === undefined || (!r.from && !r.to) ? undefined : r;
}

/** What it needs from a query string: URLSearchParams fits, and so does a plain lookup. */
export interface QueryLike {
  get(key: string): string | null;
}

/** Anything it doesn't understand is left out, so an old or hand-edited link still opens. */
export function filtersFromQuery(q: QueryLike): PlotFilters {
  const f: PlotFilters = {};
  const get = (k: string) => q.get(k) ?? undefined;
  const v = (k: string) => get(k)?.trim() || undefined;
  let s: string | undefined;
  if ((s = v('cultura'))) f.crops = list(s);
  if ((s = v('suprafata'))) f.sizeAri = parseRange(s, haToAri);
  if ((s = v('venit'))) f.revenue = parseMoney(s);
  if ((s = v('cheltuieli'))) f.expenses = parseMoney(s);
  if ((s = v('rezultat'))) f.result = parseMoney(s);
  if ((s = v('tratamente'))) {
    if (s === 'da') f.treatmentsDone = 'some';
    else if (s === 'nu') f.treatmentsDone = 'none';
    else {
      const kinds = list(s).filter((k): k is OperationKind => (OPERATION_KINDS as readonly string[]).includes(k));
      if (kinds.length) f.treatmentsDone = kinds;
    }
  }
  if ((s = v('de_facut')) && TODO[s]) f.todo = TODO[s];
  if ((s = v('semanat'))) f.sown = parseMonths(s);
  if ((s = v('recolta'))) f.harvest = parseMonths(s);
  if ((s = v('localitate'))) {
    const codes = list(s).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (codes.length) f.siruta = codes;
  }
  if ((s = v('bloc'))) f.text = s.slice(0, 40);
  if ((s = v('loc'))) {
    const p = list(s).map((x) => PLACEMENTS[x]).filter((x): x is Placement => !!x);
    if (p.length) f.placement = p;
  }
  if ((s = v('folosinta'))) f.landUse = list(s).map((x) => x.toUpperCase());
  if ((s = v('rotatie')) === 'da' || s === 'nu') f.cropChanged = s === 'da';
  for (const k of Object.keys(f) as (keyof PlotFilters)[]) if (f[k] === undefined) delete f[k];
  return f;
}

/** The URL keys, in a fixed order; pass to new URLSearchParams() in the page. */
export function filtersToQuery(f: PlotFilters): Record<string, string> {
  const q: Record<string, string> = {};
  const range = (r: ValueRange<number> | undefined, unit: (n: number) => string) =>
    r && `${r.min != null ? unit(r.min) : ''}..${r.max != null ? unit(r.max) : ''}`;
  const ha = (ari: number) => String(ari / 100);
  const lei = (bani: number) => String(bani / 100);
  const money = (r: MoneyRange | undefined) => r && `${range(r, lei)}${r.perHa ? '/ha' : ''}`;
  const months = (r: MonthRange | undefined) => r && `${r.from ?? ''}..${r.to ?? ''}`;
  const set = (k: string, val: string | undefined) => {
    if (val) q[k] = val;
  };
  set('cultura', f.crops?.join(','));
  set('suprafata', range(f.sizeAri, ha));
  set('venit', money(f.revenue));
  set('cheltuieli', money(f.expenses));
  set('rezultat', money(f.result));
  set('tratamente', f.treatmentsDone === 'some' ? 'da' : f.treatmentsDone === 'none' ? 'nu' : f.treatmentsDone?.join(','));
  set('de_facut', Object.keys(TODO).find((k) => TODO[k] === f.todo));
  set('semanat', months(f.sown));
  set('recolta', months(f.harvest));
  set('localitate', f.siruta?.join(','));
  set('bloc', f.text);
  set('loc', f.placement?.map((p) => Object.keys(PLACEMENTS).find((k) => PLACEMENTS[k] === p)).join(','));
  set('folosinta', f.landUse?.join(','));
  set('rotatie', f.cropChanged === undefined ? undefined : f.cropChanged ? 'da' : 'nu');
  return q;
}

/** One filter taken away, as a chip's × does. */
export function withoutFilter(f: PlotFilters, key: keyof PlotFilters): PlotFilters {
  const next = { ...f };
  delete next[key];
  return next;
}

/** The filters set, in the order the chips show them. */
export const FILTER_ORDER: readonly (keyof PlotFilters)[] = [
  'crops',
  'sizeAri',
  'revenue',
  'expenses',
  'result',
  'treatmentsDone',
  'todo',
  'sown',
  'harvest',
  'siruta',
  'text',
  'placement',
  'landUse',
  'cropChanged',
];
export const activeFilters = (f: PlotFilters) => FILTER_ORDER.filter((k) => f[k] !== undefined);

// ── What there is to choose from ────────────────────────────────────────────

/** What the farm's own rows hold, so the „Filtre” sheet offers only choices that can match something. */
export interface FilterOptions {
  /** Crops this year, largest area first; UNKNOWN_CROP last when some parcel has none. */
  crops: string[];
  sizeAri: { min: number; max: number } | null;
  /** Months that occur, sorted. */
  sown: string[];
  harvest: string[];
  siruta: number[];
  landUses: string[];
  placements: Placement[];
  /** Kinds of work done on some parcel this year. */
  doneKinds: OperationKind[];
  /** Some parcel has work still to do. */
  hasTodo: boolean;
  /** Some parcel has a season both this year and last, so the rotation filter means something. */
  hasRotation: boolean;
  /** Some parcel has money on it. */
  hasMoney: boolean;
}

export function filterOptions(rows: readonly PlotRow[]): FilterOptions {
  const area = new Map<string, number>();
  const sizes: number[] = [];
  const sown = new Set<string>();
  const harvest = new Set<string>();
  const siruta = new Set<number>();
  const landUses = new Set<string>();
  const placements = new Set<Placement>();
  const done = new Set<OperationKind>();
  let hasTodo = false;
  let hasRotation = false;
  let hasMoney = false;
  for (const r of rows) {
    const key = cropKeyOf(r);
    area.set(key, (area.get(key) ?? 0) + (r.season?.area_ari ?? 0));
    if (r.season) sizes.push(r.season.area_ari);
    if (r.sowing?.month) sown.add(r.sowing.month);
    if (r.harvest?.month) harvest.add(r.harvest.month);
    for (const c of [r.plot.siruta, r.plot.village_siruta]) if (c) siruta.add(c);
    if (r.plot.land_use) landUses.add(r.plot.land_use);
    placements.add(placementOf(r.plot.geometry_source));
    for (const o of r.operations.done) done.add(o.kind);
    hasTodo ||= r.operations.todo.length > 0;
    hasRotation ||= !!r.season && !!r.previous;
    hasMoney ||= !!r.money && (r.money.expenses.total !== 0 || r.money.revenue.total !== 0);
  }
  const crops = [...area.entries()]
    .sort((a, b) => Number(a[0] === UNKNOWN_CROP) - Number(b[0] === UNKNOWN_CROP) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
  return {
    crops,
    sizeAri: sizes.length ? { min: Math.min(...sizes), max: Math.max(...sizes) } : null,
    sown: [...sown].sort(),
    harvest: [...harvest].sort(),
    siruta: [...siruta].sort((a, b) => a - b),
    landUses: [...landUses].sort(),
    placements: (['placed', 'approx', 'none'] as const).filter((p) => placements.has(p)),
    doneKinds: OPERATION_KINDS.filter((k) => done.has(k)),
    hasTodo,
    hasRotation,
    hasMoney,
  };
}

// ── How the list is shown, in the URL too ───────────────────────────────────

export interface PlotView {
  /** The campaign (harvest year); undefined = the page's default. */
  year?: number;
  /** One row per parcel, or „Pe culturi”. */
  byCrop: boolean;
  sort: SortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_VIEW: PlotView = { byCrop: false, sort: 'name', dir: 'asc' };

const SORT_WORDS: Record<SortKey, string> = {
  name: 'nume',
  size: 'suprafata',
  result_ha: 'rezultat_ha',
  expenses: 'cheltuieli',
  harvest: 'recolta',
  next_treatment: 'tratament',
};

export function viewFromQuery(q: QueryLike): PlotView {
  const view: PlotView = { ...DEFAULT_VIEW };
  const year = Number(q.get('an'));
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) view.year = year;
  if (q.get('vedere') === 'culturi') view.byCrop = true;
  const [word, dir] = (q.get('ordine') ?? '').split('-');
  const sort = SORT_KEYS.find((k) => SORT_WORDS[k] === word);
  if (sort) {
    view.sort = sort;
    view.dir = dir === 'desc' ? 'desc' : 'asc';
  }
  return view;
}

/** Only what differs from the default goes in the URL. */
export function viewToQuery(v: PlotView): Record<string, string> {
  const q: Record<string, string> = {};
  if (v.year !== undefined) q.an = String(v.year);
  if (v.byCrop) q.vedere = 'culturi';
  if (v.sort !== DEFAULT_VIEW.sort || v.dir !== DEFAULT_VIEW.dir) q.ordine = `${SORT_WORDS[v.sort]}${v.dir === 'desc' ? '-desc' : ''}`;
  return q;
}

/** Every URL key the filters and the view use, so the page can drop them before writing new ones. */
export const PLOT_QUERY_KEYS = [
  'cultura',
  'suprafata',
  'venit',
  'cheltuieli',
  'rezultat',
  'tratamente',
  'de_facut',
  'semanat',
  'recolta',
  'localitate',
  'bloc',
  'loc',
  'folosinta',
  'rotatie',
  'an',
  'vedere',
  'ordine',
] as const;
