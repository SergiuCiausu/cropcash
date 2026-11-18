/* What the farm map draws for each parcel (docs/harta-plan.md, step 7), worked out apart from the map so
   it can be tested: the shape or the rough point, its colour and pattern, its icon, whether it is dimmed
   by the filters or selected, and the boxes to fly to. */
import type { Crop } from '../../../packages/shared/src/data/index';
import { bbox, centroid, dueWithin, type BBox, type PlotGeometry, type PlotRow, type Position } from '../../../packages/shared/src/plots/index';
import { cropLook, INK, resultColor, TODO_COLORS, type Pattern, type TodoLevel } from './palette';

export type ColorBy = 'crop' | 'result' | 'nextTreatment';

/** Properties on each feature; MapLibre expressions read them. Flags are 0/1 because filters compare numbers. */
export interface PlotProps {
  id: string;
  color: string;
  pattern: Pattern;
  /** The image a patterned extrusion uses: pattern and colour, made once per pair (patterns.ts). */
  patternId: string;
  /** 1 when the place is only roughly known: drawn dashed, flat, never as sure as an outline. */
  approx: 0 | 1;
  dim: 0 | 1;
  selected: 0 | 1;
  outline: string;
}

export interface PlotIcon {
  id: string;
  at: Position;
  icon: string;
  dim: boolean;
}

type Feature<G> = { type: 'Feature'; id?: number; properties: PlotProps; geometry: G };
export interface FeatureCollection<G> {
  type: 'FeatureCollection';
  features: Feature<G>[];
}

export interface PlotFeatures {
  areas: FeatureCollection<PlotGeometry>;
  /** Parcels placed only somewhere in their commune: a soft circle at the commune's middle. */
  points: FeatureCollection<{ type: 'Point'; coordinates: Position }>;
  icons: PlotIcon[];
  /** Each parcel's box, to fly to it. */
  boxes: Map<string, BBox>;
  /** Pattern and colour pairs in use, to make their images. */
  patterns: { id: string; pattern: Pattern; color: string }[];
}

export interface FeatureOptions {
  crops: ReadonlyMap<string, Pick<Crop, 'id' | 'genus' | 'kind'>>;
  colorBy: ColorBy;
  selected: ReadonlySet<string>;
  dimmed: ReadonlySet<string>;
  today: string;
  soonDays: number;
}

export function todoLevel(row: PlotRow, today: string, soonDays: number): TodoLevel {
  const ops = row.operations;
  if (ops.overdue.length) return 'overdue';
  if (dueWithin(ops.next, today, soonDays)) return 'soon';
  return ops.todo.length ? 'later' : 'none';
}

/** Where a parcel is: an outline, a rough point, or nowhere on the map. */
export function whereOf(row: PlotRow): { geometry: PlotGeometry } | { point: Position } | null {
  const p = row.plot;
  if (p.geometry_source === 'none') return null;
  if (p.geometry) return { geometry: p.geometry };
  if (p.centroid_lng != null && p.centroid_lat != null) return { point: [p.centroid_lng, p.centroid_lat] };
  return null;
}

export function plotFeatures(rows: readonly PlotRow[], o: FeatureOptions): PlotFeatures {
  const largest = Math.max(0, ...rows.map((r) => Math.abs(r.money?.perHa?.result ?? 0)));
  const out: PlotFeatures = { areas: { type: 'FeatureCollection', features: [] }, points: { type: 'FeatureCollection', features: [] }, icons: [], boxes: new Map(), patterns: [] };
  const patterns = new Map<string, PlotFeatures['patterns'][number]>();

  rows.forEach((row, n) => {
    const where = whereOf(row);
    if (!where) return;
    const id = row.plot.id;
    const look = cropLook(row.season?.crop_id ? o.crops.get(row.season.crop_id) : undefined);
    const color =
      o.colorBy === 'result' ? resultColor(row.money?.perHa?.result ?? null, largest) : o.colorBy === 'nextTreatment' ? TODO_COLORS[todoLevel(row, o.today, o.soonDays)] : look.color;
    // Only the crop colours carry the crop's pattern; the other colourings must read at a glance.
    const pattern: Pattern = o.colorBy === 'crop' ? look.pattern : 'none';
    const patternId = `${pattern}-${color.slice(1)}`;
    if (!patterns.has(patternId)) patterns.set(patternId, { id: patternId, pattern, color });
    const approx = row.plot.geometry_source === 'approx' ? 1 : 0;
    const props: PlotProps = {
      id,
      color,
      pattern,
      patternId,
      approx,
      dim: o.dimmed.has(id) ? 1 : 0,
      selected: o.selected.has(id) ? 1 : 0,
      outline: approx ? INK.approx : INK.outline,
    };
    if ('geometry' in where) {
      out.areas.features.push({ type: 'Feature', id: n, properties: props, geometry: where.geometry });
      out.boxes.set(id, bbox([where.geometry])!);
      if (look.icon && !approx) out.icons.push({ id, at: centroid(where.geometry), icon: look.icon, dim: !!props.dim });
    } else {
      out.points.features.push({ type: 'Feature', id: n, properties: { ...props, approx: 1 }, geometry: { type: 'Point', coordinates: where.point } });
      const [lng, lat] = where.point;
      out.boxes.set(id, { west: lng, south: lat, east: lng, north: lat });
    }
  });
  out.patterns = [...patterns.values()];
  return out;
}

/** One box around the given parcels (all when `ids` is empty), or null when none is on the map. */
export function boxOf(boxes: ReadonlyMap<string, BBox>, ids: readonly string[] = []): BBox | null {
  const list = (ids.length ? ids.map((id) => boxes.get(id)) : [...boxes.values()]).filter((b): b is BBox => !!b);
  if (!list.length) return null;
  return list.reduce((a, b) => ({ west: Math.min(a.west, b.west), south: Math.min(a.south, b.south), east: Math.max(a.east, b.east), north: Math.max(a.north, b.north) }));
}

/** Legend entries for the colouring in use: what each colour means, only for colours on the map. */
export function legendOf(rows: readonly PlotRow[], o: FeatureOptions, cropName: (id: string) => string): { color: string; label: string; icon?: string }[] {
  if (o.colorBy === 'crop') {
    const seen = new Map<string, { color: string; label: string; icon?: string }>();
    for (const r of rows) {
      if (!whereOf(r)) continue;
      const id = r.season?.crop_id ?? null;
      const key = id ?? '';
      if (seen.has(key)) continue;
      const look = cropLook(id ? o.crops.get(id) : undefined);
      seen.set(key, { color: look.color, label: id ? cropName(id) : 'Fără cultură', ...(look.icon && { icon: look.icon }) });
    }
    return [...seen.values()];
  }
  if (o.colorBy === 'result') {
    return [
      { color: resultColor(-1, 1), label: 'Pierdere pe hectar' },
      { color: resultColor(1, 1), label: 'Câștig pe hectar' },
      { color: resultColor(null, 1), label: 'Fără bani notați' },
    ];
  }
  const labels: Record<TodoLevel, string> = { overdue: 'Lucrări întârziate', soon: `De făcut în ${o.soonDays} de zile`, later: 'De făcut mai târziu', none: 'Nimic de făcut' };
  const levels = new Set(rows.filter((r) => whereOf(r)).map((r) => todoLevel(r, o.today, o.soonDays)));
  return (Object.keys(labels) as TodoLevel[]).filter((l) => levels.has(l)).map((l) => ({ color: TODO_COLORS[l], label: labels[l] }));
}
