import { describe, expect, it } from 'vitest';
import params from '../../../../docs/data/plots-params.json';
import { areaM2, bbox, centroid, containsPoint, flattenShape, geodesicAreaAri, isSimpleRing, overlapRatio } from './geometry';
import { PlotsParamsSchema, ShapeSchema, type Polygon, type Position, type Shape } from './model';

const SEGMENTS = PlotsParamsSchema.parse(params).curve_segments.value;

/** A square of `m` metres with its south-west corner at Măldăeni, as [lng, lat]. */
const LAT = 44.1;
const LNG = 25.0;
const M_PER_DEG_LAT = 6_378_137 * (Math.PI / 180);
const mPerDegLng = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);
const at = (eastM: number, northM: number): Position => [LNG + eastM / mPerDegLng, LAT + northM / M_PER_DEG_LAT];
const square = (m: number, dx = 0): Polygon => ({
  type: 'Polygon',
  coordinates: [[at(dx, 0), at(dx + m, 0), at(dx + m, m), at(dx, m), at(dx, 0)]],
});
const shapeOf = (pts: Position[], edges?: Shape['edges'], corner?: number): Shape => ({
  vertices: pts.map((p) => ({ at: p, ...(corner ? { cornerM: corner } : {}) })),
  edges: edges ?? pts.map(() => ({ type: 'line' as const })),
});

describe('areas', () => {
  it('a 100 m square is one hectare, 100 ari', () => {
    expect(geodesicAreaAri(square(100))).toBe(100);
  });

  it('a hole is taken out, and a multipolygon adds up', () => {
    const outer = square(200).coordinates[0]!;
    const hole = square(100).coordinates[0]!.map(([x, y]) => [x + 50 / mPerDegLng, y + 50 / M_PER_DEG_LAT] as Position);
    expect(geodesicAreaAri({ type: 'Polygon', coordinates: [outer, hole] })).toBe(300);
    expect(geodesicAreaAri({ type: 'MultiPolygon', coordinates: [square(100).coordinates, square(100, 500).coordinates] })).toBe(200);
  });
});

describe('the drawing becomes a polygon', () => {
  const pts = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];

  it('straight edges keep only the corners, closed', () => {
    const p = flattenShape(shapeOf(pts), SEGMENTS);
    expect(p.coordinates[0]).toHaveLength(5);
    expect(p.coordinates[0]![0]).toEqual(p.coordinates[0]![4]);
    expect(geodesicAreaAri(p)).toBe(100);
  });

  it('an edge bowed outwards adds area; one bowed inwards takes it away', () => {
    const out: Shape['edges'] = [{ type: 'quad', c: at(50, -40) }, { type: 'line' }, { type: 'line' }, { type: 'line' }];
    const inward: Shape['edges'] = [{ type: 'quad', c: at(50, 40) }, { type: 'line' }, { type: 'line' }, { type: 'line' }];
    // A parabola 40 m deep at its control point bulges 20 m: 2/3 × 100 × 20 = 1333 m², about 13 ari.
    expect(geodesicAreaAri(flattenShape(shapeOf(pts, out), SEGMENTS))).toBe(113);
    expect(geodesicAreaAri(flattenShape(shapeOf(pts, inward), SEGMENTS))).toBe(87);
  });

  it('a cubic edge is sampled, not cut straight', () => {
    const edges: Shape['edges'] = [{ type: 'cubic', c1: at(30, -30), c2: at(70, -30) }, { type: 'line' }, { type: 'line' }, { type: 'line' }];
    const p = flattenShape(shapeOf(pts, edges), SEGMENTS);
    expect(p.coordinates[0]!.length).toBeGreaterThan(SEGMENTS);
    expect(areaM2(p)).toBeGreaterThan(10_000);
  });

  it('rounded corners take a little area from each corner', () => {
    const sharp = areaM2(flattenShape(shapeOf(pts), SEGMENTS));
    const round = areaM2(flattenShape(shapeOf(pts, undefined, 10), SEGMENTS));
    // A 10 m fillet on a right angle: the corner triangle is 10 × 10 / 2 = 50 m², and the parabola
    // keeps 2/3 of it, so each corner loses about 17 m².
    expect(sharp - round).toBeGreaterThan(4 * 15);
    expect(sharp - round).toBeLessThan(4 * 19);
  });

  it('a corner can never eat more than its edges', () => {
    const p = flattenShape(shapeOf(pts, undefined, 1000), SEGMENTS);
    expect(isSimpleRing(p.coordinates[0]!)).toBe(true);
    expect(areaM2(p)).toBeGreaterThan(5_000);
  });

  it('the shape schema wants one edge per vertex', () => {
    expect(ShapeSchema.safeParse({ vertices: shapeOf(pts).vertices, edges: [{ type: 'line' }] }).success).toBe(false);
    expect(ShapeSchema.safeParse(shapeOf(pts)).success).toBe(true);
  });
});

describe('measures for the map', () => {
  it('centre, bounds and containment', () => {
    const [lng, lat] = centroid(square(100));
    expect(lng).toBeCloseTo(at(50, 50)[0], 6);
    expect(lat).toBeCloseTo(at(50, 50)[1], 6);
    const b = bbox([square(100), square(100, 300)])!;
    expect(b.west).toBeCloseTo(LNG, 9);
    expect(b.east).toBeCloseTo(at(400, 0)[0], 9);
    expect(bbox([])).toBeNull();
    expect(containsPoint(square(100), at(50, 50))).toBe(true);
    expect(containsPoint(square(100), at(150, 50))).toBe(false);
  });

  it('overlap is the share of the first shape inside the second', () => {
    expect(overlapRatio(square(100), square(100))).toBeCloseTo(1, 2);
    expect(overlapRatio(square(100), square(100, 50))).toBeCloseTo(0.5, 1);
    expect(overlapRatio(square(100), square(100, 500))).toBe(0);
  });

  it('a bow-tie outline is not simple', () => {
    expect(isSimpleRing([at(0, 0), at(100, 100), at(100, 0), at(0, 100), at(0, 0)])).toBe(false);
    expect(isSimpleRing(square(100).coordinates[0]!)).toBe(true);
  });
});
