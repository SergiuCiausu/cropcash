/* Parcel shapes: the drawing (straight and curved edges, rounded corners) flattened into a GeoJSON
   polygon, and the measures the map and the matching need. Pure. Parcels are a few km at most, so a
   flat projection around the shape is exact enough for the drawing; areas use the sphere. */
import type { PlotGeometry, Polygon, Position, Shape, ShapeEdge } from './model';
import type { Ari } from '../money';

/** WGS84 equatorial radius, the one GeoJSON area tools use. */
const EARTH_RADIUS_M = 6_378_137;
const RAD = Math.PI / 180;
const COORD_DECIMALS = 7;

type Pt = { x: number; y: number };

interface Frame {
  toLocal(p: Position): Pt;
  toLngLat(p: Pt): Position;
}

/** Metres east/north of an origin. */
function frameAround(origin: Position): Frame {
  const [lng0, lat0] = origin;
  const kx = EARTH_RADIUS_M * RAD * Math.cos(lat0 * RAD);
  const ky = EARTH_RADIUS_M * RAD;
  const round = (n: number) => Number(n.toFixed(COORD_DECIMALS));
  return {
    toLocal: ([lng, lat]) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky }),
    toLngLat: ({ x, y }) => [round(lng0 + x / kx), round(lat0 + y / ky)],
  };
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Every edge as a cubic Bézier [p0, c1, c2, p3]; a line keeps `line: true` so it isn't sampled. */
interface Segment {
  p: [Pt, Pt, Pt, Pt];
  line: boolean;
}

function toSegment(edge: ShapeEdge, from: Pt, to: Pt, f: Frame): Segment {
  if (edge.type === 'line') return { p: [from, lerp(from, to, 1 / 3), lerp(from, to, 2 / 3), to], line: true };
  if (edge.type === 'cubic') return { p: [from, f.toLocal(edge.c1), f.toLocal(edge.c2), to], line: false };
  // Quadratic → cubic: the same curve.
  const c = f.toLocal(edge.c);
  return { p: [from, lerp(from, c, 2 / 3), lerp(to, c, 2 / 3), to], line: false };
}

/** The part of a cubic between t0 and t1 (de Casteljau). */
function subCubic([p0, p1, p2, p3]: Segment['p'], t0: number, t1: number): Segment['p'] {
  const split = (q: Segment['p'], t: number): [Segment['p'], Segment['p']] => {
    const a = lerp(q[0], q[1], t);
    const b = lerp(q[1], q[2], t);
    const c = lerp(q[2], q[3], t);
    const d = lerp(a, b, t);
    const e = lerp(b, c, t);
    const m = lerp(d, e, t);
    return [
      [q[0], a, d, m],
      [m, e, c, q[3]],
    ];
  };
  const tail = split([p0, p1, p2, p3], t0)[1];
  return t1 >= 1 ? tail : split(tail, (t1 - t0) / (1 - t0))[0];
}

function cubicAt([p0, p1, p2, p3]: Segment['p'], t: number): Pt {
  const u = 1 - t;
  return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
}

/** The direction a segment arrives at its end / leaves its start, falling back to the chord. */
function arriving(s: Segment): Pt {
  const d = sub(s.p[3], s.p[2]);
  return len(d) > 1e-9 ? d : sub(s.p[3], s.p[0]);
}
function leaving(s: Segment): Pt {
  const d = sub(s.p[1], s.p[0]);
  return len(d) > 1e-9 ? d : sub(s.p[3], s.p[0]);
}

/** A rounded corner can take at most this share of each edge next to it. */
const MAX_CORNER_SHARE = 0.45;

/**
 * The drawing as a closed GeoJSON polygon. Curves are sampled with `segments` points; a rounded
 * corner is a quadratic curve through the trimmed edges, with the corner itself as its control point.
 */
export function flattenShape(shape: Shape, segments: number): Polygon {
  const f = frameAround(shape.vertices[0]!.at);
  const v = shape.vertices.map((x) => f.toLocal(x.at));
  const n = v.length;
  const segs = shape.edges.map((e, i) => toSegment(e, v[i]!, v[(i + 1) % n]!, f));
  const chord = segs.map((s) => len(sub(s.p[3], s.p[0])));

  // How far back each corner is cut, on the edge arriving (into) and the edge leaving (out of) it.
  const cut = shape.vertices.map((vertex, i) => {
    const r = vertex.cornerM ?? 0;
    if (r <= 0) return 0;
    const into = segs[(i - 1 + n) % n]!;
    const out = segs[i]!;
    const a = arriving(into);
    const b = leaving(out);
    const cos = -(a.x * b.x + a.y * b.y) / (len(a) * len(b) || 1);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (angle < 1e-3 || Math.PI - angle < 1e-3) return 0;
    const d = r / Math.tan(angle / 2);
    return Math.min(d, MAX_CORNER_SHARE * chord[(i - 1 + n) % n]!, MAX_CORNER_SHARE * chord[i]!);
  });

  const ring: Pt[] = [];
  segs.forEach((s, i) => {
    const t0 = chord[i]! > 0 ? cut[i]! / chord[i]! : 0;
    const t1 = chord[i]! > 0 ? 1 - cut[(i + 1) % n]! / chord[i]! : 1;
    const part = subCubic(s.p, t0, t1);
    if (s.line) ring.push(part[0], part[3]);
    else for (let k = 0; k <= segments; k++) ring.push(cubicAt(part, k / segments));
    // The rounded corner at the end of this edge, up to where the next edge starts.
    const next = (i + 1) % n;
    if (cut[next]! > 0) {
      const nextStart = subCubic(segs[next]!.p, cut[next]! / chord[next]!, 1)[0];
      const corner = v[next]!;
      for (let k = 1; k < segments; k++) {
        const t = k / segments;
        ring.push(add(add(mul(part[3], (1 - t) * (1 - t)), mul(corner, 2 * (1 - t) * t)), mul(nextStart, t * t)));
      }
    }
  });

  const coords = dedupe(ring.map((p) => f.toLngLat(p)));
  coords.push(coords[0]!);
  return { type: 'Polygon', coordinates: [coords] };
}

function dedupe(ring: Position[]): Position[] {
  const out: Position[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

const polygonsOf = (g: PlotGeometry): Position[][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/** Area of a ring on the sphere, in m² (same formula as @turf/area). */
function ringAreaM2(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i]!;
    const [lng2, lat2] = ring[i + 1]!;
    total += (lng2 - lng1) * RAD * (2 + Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function areaM2(g: PlotGeometry): number {
  return polygonsOf(g).reduce(
    (sum, [outer, ...holes]) => sum + ringAreaM2(outer!) - holes.reduce((h, r) => h + ringAreaM2(r), 0),
    0,
  );
}

/** Area in whole ari (100 m²), like every area the app stores. */
export function geodesicAreaAri(g: PlotGeometry): Ari {
  return Math.round(areaM2(g) / 100);
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function bbox(geometries: readonly PlotGeometry[]): BBox | null {
  let b: BBox | null = null;
  for (const g of geometries)
    for (const poly of polygonsOf(g))
      for (const [lng, lat] of poly[0]!) {
        b = b
          ? { west: Math.min(b.west, lng), south: Math.min(b.south, lat), east: Math.max(b.east, lng), north: Math.max(b.north, lat) }
          : { west: lng, south: lat, east: lng, north: lat };
      }
  return b;
}

/** The area-weighted centre, as [lng, lat]. It can fall outside an L- or U-shaped parcel. */
export function centroid(g: PlotGeometry): Position {
  const first = polygonsOf(g)[0]![0]![0]!;
  const f = frameAround(first);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const poly of polygonsOf(g))
    poly.forEach((ring, ri) => {
      const sign = ri === 0 ? 1 : -1;
      const pts = ring.map((p) => f.toLocal(p));
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!;
        const q = pts[i + 1]!;
        const cross = (p.x * q.y - q.x * p.y) * sign;
        a += cross;
        cx += (p.x + q.x) * cross;
        cy += (p.y + q.y) * cross;
      }
    });
  if (Math.abs(a) < 1e-9) return f.toLngLat(f.toLocal(first));
  return f.toLngLat({ x: cx / (3 * a), y: cy / (3 * a) });
}

function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function containsPoint(g: PlotGeometry, p: Position): boolean {
  return polygonsOf(g).some(([outer, ...holes]) => inRing(p, outer!) && !holes.some((h) => inRing(p, h)));
}

const OVERLAP_GRID = 60;

/**
 * The share of `a` that also lies in `b`, from 0 to 1, measured on a grid of points over `a`.
 * Good to about a percent, which is all matching last year's parcel needs.
 */
export function overlapRatio(a: PlotGeometry, b: PlotGeometry): number {
  const ba = bbox([a]);
  const bb = bbox([b]);
  if (!ba || !bb || ba.east < bb.west || bb.east < ba.west || ba.north < bb.south || bb.north < ba.south) return 0;
  let inA = 0;
  let inBoth = 0;
  for (let i = 0; i < OVERLAP_GRID; i++)
    for (let j = 0; j < OVERLAP_GRID; j++) {
      const p: Position = [
        ba.west + ((i + 0.5) / OVERLAP_GRID) * (ba.east - ba.west),
        ba.south + ((j + 0.5) / OVERLAP_GRID) * (ba.north - ba.south),
      ];
      if (!containsPoint(a, p)) continue;
      inA++;
      if (containsPoint(b, p)) inBoth++;
    }
  return inA === 0 ? 0 : inBoth / inA;
}

/** False when two edges of the outline cross: a drawing the farmer has to fix before saving. */
export function isSimpleRing(ring: Position[]): boolean {
  const n = ring.length - 1;
  const cross = (o: Position, a: Position, b: Position) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const meet = (p1: Position, p2: Position, q1: Position, q2: Position) =>
    cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (meet(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return false;
    }
  return true;
}

/* For the drawing editor (edit.ts): metres around a point, and the corner limit flattenShape applies. */
export type { Frame as MetreFrame, Pt as MetrePoint };
export const metreFrame = frameAround;
export const CORNER_MAX_SHARE = MAX_CORNER_SHARE;
