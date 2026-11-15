/* The admin panel's logic (docs/admin-panel-plan.md step 6): the figures it lists, what an admin may
   type, the draft kept on the phone, the checks before publishing and the before/after preview.
   No React and no network, so the tests drive it directly. The page is components/pages/Admin.tsx. */
import {
  applyOverrides,
  FACTOR_GROUPS,
  listFactors,
  OverrideError,
  parsePath,
  RAW_FILES,
  type AppData,
  type Factor,
  type FactorGroup,
  type Override,
  type OverrideValue,
  type RawFiles,
} from '../../../packages/shared/src/data/index';
import { summarizePlan, type PlanSummary, type SummaryKey } from '../../../packages/shared/src/cashflow/plan-diff';
import { computeFarmPlan } from '../../../packages/shared/src/cashflow/plan';
import type { MonthKey } from '../../../packages/shared/src/cashflow/dates';
import type { FarmState } from './farm';
import { farmView } from './plan';
import { KEYS, readJson, remove, writeJson, type KeyStore } from './storage';

export { FACTOR_GROUPS };
export type { FactorGroup };

const MONTH_NAMES = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
/** Units read before the number: "luna 7", "ziua 15". */
const UNIT_FIRST = new Set(['luna', 'ziua', 'ora', 'anul']);

export interface FactorRow {
  path: string;
  factor: Factor;
  /** What the path picks, in words: the crop, the scheme, the month, the year. Empty for a single figure. */
  where: string;
  /** The figure in docs/data. */
  fileValue: OverrideValue;
  /** The figure in force: the published one, or the file's. */
  value: OverrideValue;
  /** Why it was changed, when it was. */
  reason: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "Grâu", "Sprijin de bază (BISS), PD-01", "martie", "2025". */
export function whereOf(path: string, raw: RawFiles = RAW_FILES): string {
  const segments = parsePath(path);
  const parts: string[] = [];
  segments.forEach((seg, i) => {
    const prev = segments[i - 1]?.key;
    if (!seg.select) {
      /* history.schemes.PD-01: the scheme is a key, not a selector. */
      if (prev === 'schemes' && segments[0]?.key === 'history') parts.push(seg.key);
      return;
    }
    const sel = Object.fromEntries(seg.select);
    if (seg.key === 'crops' && sel.id) {
      const crops = (raw as unknown as { crops: { crops: { id: string; name_ro?: string }[] } }).crops.crops;
      parts.push(crops.find((c) => c.id === sel.id)?.name_ro ?? sel.id);
    } else if (seg.key === 'schemes' && sel.code) {
      const schemes = (raw as unknown as { subsidies: { schemes: { code: string; name_ro?: string }[] } }).subsidies.schemes;
      const name = schemes.find((s) => s.code === sel.code)?.name_ro;
      parts.push(name ? `${name}, ${sel.code}` : sel.code);
    } else if (sel.month) {
      parts.push(MONTH_NAMES[Number(sel.month) - 1] ?? sel.month);
    } else {
      parts.push(seg.select.map(([, v]) => v).join(' '));
    }
  });
  return parts.join(' · ');
}

/** Every figure the panel can change, with the value in force and why. */
export function factorRows(published: readonly Override[], raw: RawFiles = RAW_FILES): FactorRow[] {
  const changed = new Map(published.map((o) => [o.path, o]));
  return listFactors(raw).map(({ path, factor, value }) => {
    const o = changed.get(path);
    return { path, factor, where: whereOf(path, raw), fileValue: value as OverrideValue, value: o ? o.value : (value as OverrideValue), reason: o?.reason ?? null };
  });
}

/** The keys a 'key' figure may take (e.g. the schemes with history). */
export function keyOptions(factor: Factor, raw: RawFiles = RAW_FILES): string[] {
  if (factor.type !== 'key') return [];
  let at: unknown = raw;
  for (const k of factor.keysAt.split('.')) at = isRecord(at) ? at[k] : undefined;
  return isRecord(at) ? Object.keys(at) : [];
}

const decimal = (n: number) => String(n).replace('.', ',');

/** A figure as the panel shows it: "4.800 lei/ha" style without grouping, "da", "cel mai mic", "fără cifră". */
export function showValue(factor: Factor, v: OverrideValue): string {
  if (v === null) return 'fără cifră';
  if (factor.type === 'boolean') return v ? 'da' : 'nu';
  if (factor.type === 'choice') return factor.optionLabels?.[String(v)] ?? String(v);
  if (factor.type === 'number' && typeof v === 'number') {
    if (!factor.unit) return decimal(v);
    if (UNIT_FIRST.has(factor.unit)) return factor.unit === 'luna' ? (MONTH_NAMES[v - 1] ?? `luna ${v}`) : `${factor.unit} ${v}`;
    return `${decimal(v)} ${factor.unit}`;
  }
  return String(v);
}

/** What goes in the field to start with. */
export const fieldText = (v: OverrideValue): string => (v === null ? '' : typeof v === 'number' ? decimal(v) : String(v));

export type Parsed = { ok: true; value: OverrideValue } | { ok: false; error: string };

/**
 * What the admin typed, checked against the figure's own limits. Numbers take a comma or a point;
 * an empty field means "no figure" where the file allows it.
 */
export function parseValue(factor: Factor, input: string | boolean): Parsed {
  if (factor.type === 'boolean') return typeof input === 'boolean' ? { ok: true, value: input } : { ok: false, error: 'Alege da sau nu.' };
  const text = String(input).trim();
  if (factor.type === 'choice' || factor.type === 'key') {
    const options = factor.type === 'choice' ? factor.options : keyOptions(factor);
    return options.includes(text) ? { ok: true, value: text } : { ok: false, error: 'Alege una din listă.' };
  }
  if (text === '') return factor.nullable ? { ok: true, value: null } : { ok: false, error: 'Scrie o cifră.' };
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return { ok: false, error: `Scrie doar cifre${factor.decimals ? ', cu virgulă pentru zecimale' : ''}, de exemplu ${factor.decimals ? '5,5' : '12'}.` };
  const n = Number(text.replace(',', '.'));
  const scaled = n * 10 ** factor.decimals;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-9)
    return { ok: false, error: factor.decimals ? `Cel mult ${factor.decimals === 1 ? 'o zecimală' : `${factor.decimals} zecimale`}.` : 'Scrie un număr întreg.' };
  const { min, max } = factor;
  if (min !== undefined && max !== undefined && (n < min || n > max)) return { ok: false, error: `Între ${decimal(min)} și ${decimal(max)}.` };
  if (min !== undefined && n < min) return { ok: false, error: `Cel puțin ${decimal(min)}.` };
  if (max !== undefined && n > max) return { ok: false, error: `Cel mult ${decimal(max)}.` };
  return { ok: true, value: n };
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;
/** Why a figure changes: required, so the history says where the new figure came from. */
export function reasonError(reason: string): string | null {
  const t = reason.trim();
  if (t.length < REASON_MIN) return 'Scrie de unde vine cifra (de exemplu „Agro-Info, nov. 2026”).';
  if (t.length > REASON_MAX) return `Cel mult ${REASON_MAX} de semne.`;
  return null;
}

// ── The draft, on the phone ──────────────────────────────────────────────────

export interface DraftEdit {
  value: OverrideValue;
  reason: string;
}
export interface Draft {
  /** The published version the draft started from. */
  base: number;
  /** Path → the figure the admin wants. A figure set back to the file's value drops its change. */
  edits: Record<string, DraftEdit>;
}

export function readDraft(store: KeyStore): Draft | null {
  const d = readJson<Draft>(store, KEYS.adminDraft);
  if (!isRecord(d) || typeof d.base !== 'number' || !isRecord(d.edits)) return null;
  const edits: Record<string, DraftEdit> = {};
  for (const [path, e] of Object.entries(d.edits)) {
    if (!isRecord(e) || typeof e.reason !== 'string') continue;
    const ok = e.value === null || ['number', 'string', 'boolean'].includes(typeof e.value);
    if (ok) edits[path] = { value: e.value as OverrideValue, reason: e.reason };
  }
  return { base: d.base, edits };
}
export const saveDraft = (store: KeyStore, draft: Draft) => writeJson(store, KEYS.adminDraft, draft);
export const clearDraft = (store: KeyStore) => remove(store, KEYS.adminDraft);

/** The whole set the draft would publish: the published changes with the draft's on top, sorted by path. */
export function draftSet(rows: readonly FactorRow[], published: readonly Override[], edits: Readonly<Record<string, DraftEdit>>): Override[] {
  const fileValue = new Map(rows.map((r) => [r.path, r.fileValue]));
  const set = new Map(published.map((o) => [o.path, o]));
  for (const [path, e] of Object.entries(edits)) {
    if (fileValue.has(path) && fileValue.get(path) === e.value) set.delete(path);
    else set.set(path, { path, value: e.value, reason: e.reason.trim() });
  }
  return [...set.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export interface DraftChange {
  row: FactorRow;
  /** The figure in force now, and the one the draft publishes. */
  before: OverrideValue;
  after: OverrideValue;
  /** True when the draft puts the file's figure back. */
  backToFile: boolean;
  reason: string;
}

/** The figures the draft changes against what's in force, in the panel's order. */
export function draftChanges(rows: readonly FactorRow[], edits: Readonly<Record<string, DraftEdit>>): DraftChange[] {
  return rows
    .filter((r) => r.path in edits && edits[r.path]!.value !== r.value)
    .map((r) => {
      const e = edits[r.path]!;
      return { row: r, before: r.value, after: e.value, backToFile: e.value === r.fileValue, reason: e.reason };
    });
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** The shared checks speak English (they're for the API's logs); the panel says it in Romanian. */
function checkText(e: OverrideError): string {
  const m = e.message;
  if (e.code === 'check_failed') {
    if (m.includes('smallest to the largest')) return 'Cel mai mic, mijlociu și cel mai mare trebuie să urce în ordinea asta.';
    if (m.includes('monthly shares')) {
      const sum = m.match(/add up to ([\d.]+)%/)?.[1];
      return `Părțile din cheltuieli pe luni trebuie să adune 100%${sum ? `, acum adună ${sum.replace('.', ',')}%` : ''}.`;
    }
    if (m.includes('more harvests than are counted')) return 'Nu poți cere mai multe recolte decât intră în calcul.';
    if (m.includes('would overlap')) return 'Anii slabi și anii buni s-ar suprapune.';
    if (m.includes('slider')) return 'Glisorul trebuie să înceapă sub capătul lui.';
    return 'Cifrele nu se potrivesc între ele.';
  }
  if (e.code === 'not_editable') return 'Cifra asta nu se schimbă din panou.';
  if (e.code === 'unknown_path' || e.code === 'ambiguous_path' || e.code === 'bad_path') return 'Cifra asta nu mai e în fișiere. Scoate-o din ciornă.';
  if (e.code === 'invalid_value') return 'Valoarea nu se potrivește cu cifra.';
  return 'Cu aceste cifre planul nu se poate calcula.';
}

export type Checked = { ok: true; data: AppData } | { ok: false; path: string; error: string };

/** The draft's data, or what's wrong with it. The API runs the same check before it publishes. */
export function checkSet(set: readonly Override[], raw: RawFiles = RAW_FILES): Checked {
  try {
    return { ok: true, data: applyOverrides(set, raw) };
  } catch (e) {
    if (!(e instanceof OverrideError)) throw e;
    return { ok: false, path: e.path ?? '', error: checkText(e) };
  }
}

/** A refused publish from the API, in words. */
export function publishErrorText(e: unknown): string {
  const err = e as { status?: number; code?: string; body?: Record<string, unknown> };
  if (err?.code === 'offline') return 'Nu ai internet. Publicarea cere internet.';
  /* Sent, no answer in time: it may have been published, so check before sending it again. */
  if (err?.status === 0 && err.code === 'timeout') return 'Serverul n-a răspuns la timp. Verifică istoricul înainte să încerci iar.';
  /* The connection failed with the phone online (e.g. the server was restarting). It may have dropped
     after the server published, so the history is the place to check. */
  if (err?.status === 0) return 'Serverul nu a putut fi contactat. Verifică istoricul, apoi încearcă iar peste un minut.';
  if (err?.status === 403) return 'Contul tău nu mai e de administrator.';
  if (err?.status === 400 && err.code === 'invalid_override') {
    const shaped = new OverrideError((err.body?.code as never) ?? 'invalid_data', String(err.body?.path ?? ''), String(err.body?.message ?? ''));
    return `${checkText(shaped)}${err.body?.path ? ` (${String(err.body.path)})` : ''}`;
  }
  if (err?.status === 404) return 'Versiunea asta nu mai există.';
  return 'Serverul n-a putut publica. Încearcă iar peste un minut.';
}

// ── Preview ──────────────────────────────────────────────────────────────────

/** One side of the preview: its figures and the normal year's month-end balances, before salary. */
export interface PlanSide {
  summary: PlanSummary;
  months: { key: MonthKey; balance: number }[];
}

/** The plan as the API (and Stripe) work it out for that farm, worked out once for the table and the chart. */
export function planSideOf(state: FarmState, now: Date): PlanSide | null {
  if (!state.baseFarm || !state.harvests) return null;
  const view = farmView(state, 'farm');
  const farm = view.storedFarm();
  const plan = computeFarmPlan(farm, view.data(), now);
  return { summary: summarizePlan(plan, farm, view.data()), months: plan.timelines.medium.months.map((m) => ({ key: m.key, balance: m.balanceEnd })) };
}

/** One month on the preview chart; null where one plan has no such month. */
export interface MonthPair {
  key: MonthKey;
  before: number | null;
  after: number | null;
}

export interface Preview {
  before: PlanSummary;
  after: PlanSummary;
  changed: SummaryKey[];
  months: MonthPair[];
  /** True when at least one month's balance moved. */
  monthsMoved: boolean;
}

export function comparePlans(a: PlanSide | null, b: PlanSide | null): Preview | null {
  if (!a || !b) return null;
  const changed = (Object.keys(a.summary) as SummaryKey[]).filter((k) => JSON.stringify(a.summary[k]) !== JSON.stringify(b.summary[k]));
  const months = pairMonths(a.months, b.months);
  return { before: a.summary, after: b.summary, changed, months, monthsMoved: months.some((m) => m.before !== m.after) };
}

/** Both plans' months on one axis, by month: a change to a harvest date can lengthen or shorten a plan. */
export function pairMonths(before: PlanSide['months'], after: PlanSide['months']): MonthPair[] {
  const was = new Map(before.map((m) => [m.key, m.balance]));
  const now = new Map(after.map((m) => [m.key, m.balance]));
  return [...new Set([...was.keys(), ...now.keys()])].sort().map((key) => ({ key, before: was.get(key) ?? null, after: now.get(key) ?? null }));
}
