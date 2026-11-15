/* What the drawing editor does to a shape (docs/harta-plan.md, step 5): every tool is a pure function
   from one Shape to the next, so undo is a list of shapes and the map only draws what it is given.
   Distances are in metres, worked out in a flat frame around the shape (parcels are a few km at most). */
import { CORNER_MAX_SHARE, flattenShape, geodesicAreaAri, isSimpleRing, metreFrame, type MetrePoint } from './geometry';
import type { PlotGeometry, Position, Shape, ShapeEdge } from './model';

/** Fewer corners than this isn't a field. */
export const MIN_VERTICES = 3;
/** More than this is hard to edit on a phone; a bloc outline is simplified down to it. */
export const MAX_START_VERTICES = 60;

const lerpP = (a: Position, b: Position, t: number): Position => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const round7 = (p: Position): Position => [Number(p[0].toFixed(7)), Number(p[1].toFixed(7))];
const at = (s: Shape, i: number) => s.vertices[((i % s.vertices.length) + s.vertices.length) % s.vertices.length]!.at;

// ── Starting a shape ───────────────────────────────────────────────────────────

/** A shape of straight edges through these points, in order. */
export function shapeFromPoints(points: readonly Position[]): Shape {
  if (points.length < MIN_VERTICES) throw new Error('a shape needs at least 3 points');
  return { vertices: points.map((p) => ({ at: round7(p) })), edges: points.map(() => ({ type: 'line' as const })) };
}

/** Douglas–Peucker on a closed ring, in metres. Keeps the first point. */
function simplifyRing(ring: Position[], toleranceM: number): Position[] {
  const f = metreFrame(ring[0]!);
  const pts = ring.map((p) => f.toLocal(p));
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  // Split the ring at the point farthest from the first, so both halves are open polylines.
  let far = 0;
  pts.forEach((p, i) => {
    if (Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) > Math.hypot(pts[far]!.x - pts[0]!.x, pts[far]!.y - pts[0]!.y)) far = i;
  });
  keep[far] = true;
  const distToSegment = (p: MetrePoint, a: MetrePoint, b: MetrePoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const walk = (from: number, to: number) => {
    // Indices from `from` to `to` going forward round the ring.
    const idx: number[] = [];
    for (let i = from; ; i = (i + 1) % pts.length) {
      idx.push(i);
      if (i === to) break;
    }
    const stack: [number, number][] = [[0, idx.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      let best = -1;
      let bestD = toleranceM;
      for (let k = s + 1; k < e; k++) {
        const d = distToSegment(pts[idx[k]!]!, pts[idx[s]!]!, pts[idx[e]!]!);
        if (d > bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best >= 0) {
        keep[idx[best]!] = true;
        stack.push([s, best], [best, e]);
      }
    }
  };
  if (far !== 0) {
    walk(0, far);
    walk(far, 0);
  }
  return ring.filter((_, i) => keep[i]);
}

/**
 * The outer ring of an outline (the biggest part of a MultiPolygon) as straight edges, simplified to at
 * most `maxVertices` corners: the start of „Pornește de la bloc”. Holes are dropped; the farmer draws
 * their own part anyway.
 */
export function shapeFromGeometry(g: PlotGeometry, maxVertices = MAX_START_VERTICES): Shape {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const outer = polygons
    .map((p) => p[0]!)
    .sort((a, b) => geodesicAreaAri({ type: 'Polygon', coordinates: [b] }) - geodesicAreaAri({ type: 'Polygon', coordinates: [a] }))[0]!;
  const open = outer.slice(0, -1);
  let ring = simplifyRing(open, 0.5);
  for (let tol = 1; ring.length > maxVertices; tol *= 1.5) ring = simplifyRing(open, tol);
  return shapeFromPoints(ring.length >= MIN_VERTICES ? ring : open.slice(0, MIN_VERTICES));
}

/** Romania with a margin, to tell latitude from longitude in a pasted list. */
const LAT = [43, 49] as const;
const LNG = [20, 30.5] as const;
const inRange = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

export type CoordinatesReading = { ok: true; points: Position[] } | { ok: false; error: 'too_few' | 'unreadable' | 'outside_romania'; line?: number };

/**
 * Points pasted by the farmer: one per line, "44.1162, 24.9622" or "24,9622 44,1162" (either order;
 * in Romania latitude and longitude never overlap). Decimal commas are fine when the two numbers are
 * split by a space, a semicolon or a tab. Stereo 70 (big numbers in metres) isn't read yet.
 */
export function parseCoordinates(text: string): CoordinatesReading {
  const points: Position[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    // With decimal points, a comma separates the two numbers; without any, a comma is the decimal mark.
    const parts = line.includes('.') ? line.split(/[,;\s]+/) : /[;\s]/.test(line) ? line.split(/[;\s]+/) : line.split(',');
    const numbers = parts.filter(Boolean).map((p) => Number(p.replace(',', '.')));
    if (numbers.length !== 2 || numbers.some((n) => !Number.isFinite(n))) return { ok: false, error: 'unreadable', line: i + 1 };
    const [a, b] = numbers as [number, number];
    if (inRange(a, LAT) && inRange(b, LNG)) points.push([b, a]);
    else if (inRange(a, LNG) && inRange(b, LAT)) points.push([a, b]);
    else return { ok: false, error: 'outside_romania', line: i + 1 };
  }
  // A closed list repeats its first point at the end.
  const last = points[points.length - 1];
  if (points.length > 1 && last![0] === points[0]![0] && last![1] === points[0]![1]) points.pop();
  return points.length < MIN_VERTICES ? { ok: false, error: 'too_few' } : { ok: true, points };
}

// ── Tools ──────────────────────────────────────────────────────────────────────

/** A point on edge i at t (0 = its start vertex, 1 = the next). */
export function pointOnEdge(s: Shape, i: number, t = 0.5): Position {
  const e = s.edges[i]!;
  const p0 = at(s, i);
  const p3 = at(s, i + 1);
  if (e.type === 'line') return round7(lerpP(p0, p3, t));
  const u = 1 - t;
  if (e.type === 'quad') return round7([u * u * p0[0] + 2 * u * t * e.c[0] + t * t * p3[0], u * u * p0[1] + 2 * u * t * e.c[1] + t * t * p3[1]]);
  const { c1, c2 } = e;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return round7([k[0] * p0[0] + k[1] * c1[0] + k[2] * c2[0] + k[3] * p3[0], k[0] * p0[1] + k[1] * c1[1] + k[2] * c2[1] + k[3] * p3[1]]);
}

export function moveVertex(s: Shape, i: number, to: Position): Shape {
  return { ...s, vertices: s.vertices.map((v, k) => (k === i ? { ...v, at: round7(to) } : v)) };
}

/** Moves a selected corner by metres east and north (arrow keys). */
export function nudgeVertex(s: Shape, i: number, eastM: number, northM: number): Shape {
  const f = metreFrame(s.vertices[i]!.at);
  return moveVertex(s, i, f.toLngLat({ x: eastM, y: northM }));
}

/**
 * A new corner on edge i, in the middle of it unless `to` is given. A curved edge is split where it is,
 * so the outline doesn't change until the new corner is moved.
 */
export function insertVertex(s: Shape, i: number, to?: Position): Shape {
  const e = s.edges[i]!;
  const mid = pointOnEdge(s, i, 0.5);
  let first: ShapeEdge = { type: 'line' };
  let second: ShapeEdge = { type: 'line' };
  if (e.type === 'quad') {
    const p0 = at(s, i);
    const p2 = at(s, i + 1);
    first = { type: 'quad', c: round7(lerpP(p0, e.c, 0.5)) };
    second = { type: 'quad', c: round7(lerpP(e.c, p2, 0.5)) };
  } else if (e.type === 'cubic') {
    const p0 = at(s, i);
    const p3 = at(s, i + 1);
    const a = lerpP(p0, e.c1, 0.5);
    const b = lerpP(e.c1, e.c2, 0.5);
    const c = lerpP(e.c2, p3, 0.5);
    const d = lerpP(a, b, 0.5);
    const g = lerpP(b, c, 0.5);
    first = { type: 'cubic', c1: round7(a), c2: round7(d) };
    second = { type: 'cubic', c1: round7(g), c2: round7(c) };
  }
  const vertices = [...s.vertices];
  vertices.splice(i + 1, 0, { at: to ? round7(to) : mid });
  const edges = [...s.edges];
  edges.splice(i, 1, first, second);
  return { vertices, edges };
}

/** Removes corner i; the two edges beside it become one straight edge. Never below 3 corners. */
export function deleteVertex(s: Shape, i: number): Shape {
  if (s.vertices.length <= MIN_VERTICES) return s;
  const n = s.vertices.length;
  const prev = (i - 1 + n) % n;
  const vertices = s.vertices.filter((_, k) => k !== i);
  const edges = s.edges.map((e, k) => (k === prev ? ({ type: 'line' } as const) : e)).filter((_, k) => k !== i);
  return { vertices, edges };
}

/** „Fă-o curbă”: the edge bows outward by a tenth of its length, with one handle to drag. */
export function makeCurve(s: Shape, i: number): Shape {
  if (s.edges[i]!.type !== 'line') return s;
  const f = metreFrame(at(s, i));
  const a = f.toLocal(at(s, i));
  const b = f.toLocal(at(s, i + 1));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // The normal that points away from the shape's middle.
  const centre = s.vertices.reduce((acc, v) => {
    const p = f.toLocal(v.at);
    return { x: acc.x + p.x / s.vertices.length, y: acc.y + p.y / s.vertices.length };
  }, { x: 0, y: 0 });
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  if (nx * (mid.x - centre.x) + ny * (mid.y - centre.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  // (nx, ny) is as long as the edge. A quadratic's middle sits halfway to its handle, so the handle goes
  // out a fifth of the edge for a bow of a tenth.
  const c = f.toLngLat({ x: mid.x + nx * 0.2, y: mid.y + ny * 0.2 });
  return setEdge(s, i, { type: 'quad', c });
}

/** „Fă-o dreaptă”. */
export const makeStraight = (s: Shape, i: number): Shape => setEdge(s, i, { type: 'line' });

function setEdge(s: Shape, i: number, e: ShapeEdge): Shape {
  return { ...s, edges: s.edges.map((x, k) => (k === i ? e : x)) };
}

/** Drags a curve's handle: `which` is 0 for a quadratic's one handle or a cubic's first, 1 for its second. */
export function moveHandle(s: Shape, i: number, which: 0 | 1, to: Position): Shape {
  const e = s.edges[i]!;
  if (e.type === 'quad') return setEdge(s, i, { type: 'quad', c: round7(to) });
  if (e.type === 'cubic') return setEdge(s, i, which === 0 ? { ...e, c1: round7(to) } : { ...e, c2: round7(to) });
  return s;
}

/** The largest rounding corner i can take, in whole metres: flattenShape caps the cut at 45% of each edge. */
export function maxCornerM(s: Shape, i: number): number {
  const f = metreFrame(at(s, i));
  const v = f.toLocal(at(s, i));
  const p = f.toLocal(at(s, i - 1));
  const q = f.toLocal(at(s, i + 1));
  const a = { x: p.x - v.x, y: p.y - v.y };
  const b = { x: q.x - v.x, y: q.y - v.y };
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la === 0 || lb === 0) return 0;
  const angle = Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (la * lb))));
  if (angle < 1e-3 || Math.PI - angle < 1e-3) return 0;
  return Math.max(0, Math.floor(CORNER_MAX_SHARE * Math.min(la, lb) * Math.tan(angle / 2)));
}

/** „Rotunjește colțul”: 0 makes it sharp again. Capped at maxCornerM and the schema's 1000 m. */
export function setCorner(s: Shape, i: number, metres: number): Shape {
  const r = Math.min(Math.max(0, Math.round(metres)), maxCornerM(s, i), 1000);
  return {
    ...s,
    vertices: s.vertices.map((v, k) => {
      if (k !== i) return v;
      const { cornerM: _old, ...rest } = v;
      return r > 0 ? { ...rest, cornerM: r } : rest;
    }),
  };
}

/** The nearest point of an outline within `toleranceM`, or the point itself: the 3 m snap to the bloc. */
export function snapTo(p: Position, outline: PlotGeometry | null | undefined, toleranceM = 3): Position {
  if (!outline) return p;
  const f = metreFrame(p);
  let best: Position = p;
  let bestD = toleranceM;
  const rings = (outline.type === 'Polygon' ? [outline.coordinates] : outline.coordinates).flat();
  // The bloc's corners pull first: a corner within reach wins over a nearer point on an edge.
  for (const ring of rings)
    for (const corner of ring) {
      const c = f.toLocal(corner);
      const d = Math.hypot(c.x, c.y);
      if (d <= bestD) {
        bestD = d;
        best = corner;
      }
    }
  if (best !== p) return best;
  for (const ring of rings) {
    for (let k = 0; k + 1 < ring.length; k++) {
      const a = f.toLocal(ring[k]!);
      const b = f.toLocal(ring[k + 1]!);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l2));
      const near = { x: a.x + t * dx, y: a.y + t * dy };
      const d = Math.hypot(near.x, near.y);
      if (d <= bestD) {
        bestD = d;
        best = f.toLngLat(near);
      }
    }
  }
  return best;
}

// ── Checks ─────────────────────────────────────────────────────────────────────

export interface ShapeCheck {
  geometry: PlotGeometry;
  areaAri: number;
  /** False when edges cross: it can't be saved like that. */
  simple: boolean;
  /** Off by more than area_warning_pct from the area on paper. */
  areaWarning: boolean;
  /** Signed difference from the paper, in ari (null without a paper area). */
  diffAri: number | null;
}

/** What the editor shows under the map: the live area against the declared one. */
export function checkShape(s: Shape, segments: number, declaredAri: number | null, warnPct: number): ShapeCheck {
  const geometry = flattenShape(s, segments);
  const areaAri = geodesicAreaAri(geometry);
  const diffAri = declaredAri ? areaAri - declaredAri : null;
  return {
    geometry,
    areaAri,
    simple: isSimpleRing(geometry.coordinates[0]!),
    areaWarning: diffAri !== null && declaredAri! > 0 && (Math.abs(diffAri) / declaredAri!) * 100 > warnPct,
    diffAri,
  };
}

// ── Undo ───────────────────────────────────────────────────────────────────────

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const HISTORY_LIMIT = 100;

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** A new step; the same value again (a tap that changed nothing) isn't one. */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}
