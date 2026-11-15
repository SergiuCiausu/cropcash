/* The „Filtre” sheet's form: what the farmer typed, kept as text until „Arată” turns it into filters.
   An amount it can't read is pointed out, never guessed; a range typed backwards is turned around. */
import type { MoneyRange, MonthRange, OperationKind, Placement, PlotFilters, ValueRange } from '../../../packages/shared/src/plots/index';
import { haText, leiText, typedHa, typedLei } from './filter-text';

export const MONEY_KEYS = ['revenue', 'expenses', 'result'] as const;
export type MoneyKey = (typeof MONEY_KEYS)[number];
export type TextField = 'sizeMin' | 'sizeMax' | `${MoneyKey}Min` | `${MoneyKey}Max`;

export interface FilterForm {
  crops: string[];
  sizeMin: string;
  sizeMax: string;
  money: Record<MoneyKey, { min: string; max: string; perHa: boolean }>;
  treatments: '' | 'some' | 'none' | 'kinds';
  kinds: OperationKind[];
  todo: '' | 'any' | 'overdue' | 'soon';
  sownFrom: string;
  sownTo: string;
  harvestFrom: string;
  harvestTo: string;
  siruta: number[];
  text: string;
  placement: Placement[];
  landUse: string[];
  rotation: '' | 'yes' | 'no';
}

export function formOf(f: PlotFilters): FilterForm {
  const money = (r: MoneyRange | undefined) => ({ min: leiText(r?.min), max: leiText(r?.max), perHa: r?.perHa ?? false });
  const t = f.treatmentsDone;
  return {
    crops: f.crops ?? [],
    sizeMin: haText(f.sizeAri?.min),
    sizeMax: haText(f.sizeAri?.max),
    money: { revenue: money(f.revenue), expenses: money(f.expenses), result: money(f.result) },
    treatments: t === undefined ? '' : Array.isArray(t) ? 'kinds' : t,
    kinds: Array.isArray(t) ? t : [],
    todo: f.todo ?? '',
    sownFrom: f.sown?.from ?? '',
    sownTo: f.sown?.to ?? '',
    harvestFrom: f.harvest?.from ?? '',
    harvestTo: f.harvest?.to ?? '',
    siruta: f.siruta ?? [],
    text: f.text ?? '',
    placement: f.placement ?? [],
    landUse: f.landUse ?? [],
    rotation: f.cropChanged === undefined ? '' : f.cropChanged ? 'yes' : 'no',
  };
}

export const EMPTY_FORM = formOf({});

/** The filters, or the fields that couldn't be read. */
export type FormReading = { ok: true; filters: PlotFilters } | { ok: false; bad: TextField[] };

function range<T extends number>(min: T | null, max: T | null): ValueRange<T> | undefined {
  if (min === null && max === null) return undefined;
  if (min !== null && max !== null && min > max) return { min: max, max: min };
  return { ...(min !== null && { min }), ...(max !== null && { max }) };
}

function months(from: string, to: string): MonthRange | undefined {
  if (!from && !to) return undefined;
  if (from && to && from > to) return { from: to, to: from };
  return { ...(from && { from }), ...(to && { to }) };
}

export function readForm(form: FilterForm): FormReading {
  const bad: TextField[] = [];
  const read = <T>(field: TextField, text: string, parse: (s: string) => T | null): T | null => {
    const v = parse(text);
    if (v === null && text.trim()) bad.push(field);
    return v;
  };
  const f: PlotFilters = {};
  if (form.crops.length) f.crops = form.crops;
  f.sizeAri = range(read('sizeMin', form.sizeMin, typedHa), read('sizeMax', form.sizeMax, typedHa));
  for (const k of MONEY_KEYS) {
    const m = form.money[k];
    const r = range(read(`${k}Min`, m.min, typedLei), read(`${k}Max`, m.max, typedLei));
    if (r) f[k] = { ...r, perHa: m.perHa };
  }
  if (form.treatments === 'some' || form.treatments === 'none') f.treatmentsDone = form.treatments;
  if (form.treatments === 'kinds' && form.kinds.length) f.treatmentsDone = form.kinds;
  if (form.todo) f.todo = form.todo;
  f.sown = months(form.sownFrom, form.sownTo);
  f.harvest = months(form.harvestFrom, form.harvestTo);
  if (form.siruta.length) f.siruta = form.siruta;
  if (form.text.trim()) f.text = form.text.trim().slice(0, 40);
  if (form.placement.length) f.placement = form.placement;
  if (form.landUse.length) f.landUse = form.landUse;
  if (form.rotation) f.cropChanged = form.rotation === 'yes';
  if (bad.length) return { ok: false, bad };
  for (const k of Object.keys(f) as (keyof PlotFilters)[]) if (f[k] === undefined) delete f[k];
  return { ok: true, filters: f };
}

/** Adds or removes one value of a multiple choice. */
export const toggled = <T>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
