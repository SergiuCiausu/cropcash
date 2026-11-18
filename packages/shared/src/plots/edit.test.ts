import { describe, expect, it } from 'vitest';
import bloc286 from './__fixtures__/lpis-bloc-153277-286.json';
import {
  checkShape,
  deleteVertex,
  historyOf,
  insertVertex,
  makeCurve,
  makeStraight,
  maxCornerM,
  moveHandle,
  moveVertex,
  nudgeVertex,
  parseCoordinates,
  pointOnEdge,
  pushHistory,
  redo,
  setCorner,
  shapeFromGeometry,
  shapeFromPoints,
  snapTo,
  undo,
} from './edit';
import { centroid, flattenShape, geodesicAreaAri, metreFrame } from './geometry';
import { parseBlocs } from './lpis';
import type { Position, Shape } from './model';
import { loadPlotsParams } from './params';

const SEG = loadPlotsParams().curve_segments.value;
const WARN = loadPlotsParams().area_warning_pct.value;

/** A square of `side` metres with its south-west corner at Ion's bloc. */
function square(side: number): Shape {
  const f = metreFrame([24.96, 44.11]);
  return shapeFromPoints([f.toLngLat({ x: 0, y: 0 }), f.toLngLat({ x: side, y: 0 }), f.toLngLat({ x: side, y: side }), f.toLngLat({ x: 0, y: side })]);
}
const area = (s: Shape) => geodesicAreaAri(flattenShape(s, SEG));
const metresBetween = (a: Position, b: Position) => {
  const f = metreFrame(a);
  const p = f.toLocal(b);
  return Math.hypot(p.x, p.y);
};

describe('starting a drawing', () => {
  it('from the bloc: the outline simplified to a phone-sized number of corners, area kept', () => {
    const [bloc] = parseBlocs(bloc286);
    const s = shapeFromGeometry(bloc!.geometry, 60);
    expect(s.vertices.length).toBeLessThanOrEqual(60);
    expect(s.vertices.length).toBeGreaterThanOrEqual(3);
    expect(s.edges.every((e) => e.type === 'line')).toBe(true);
    const full = geodesicAreaAri(bloc!.geometry);
    expect(Math.abs(area(s) - full) / full).toBeLessThan(0.02);
    // Simplified hard, it still keeps the field's size roughly.
    const rough = shapeFromGeometry(bloc!.geometry, 8);
    expect(rough.vertices.length).toBeLessThanOrEqual(8);
    expect(Math.abs(area(rough) - full) / full).toBeLessThan(0.15);
  });

  it('reads pasted coordinates in either order, with a decimal point or comma', () => {
    const want = [
      [24.9622, 44.1162],
      [24.9632, 44.1162],
      [24.9632, 44.1172],
    ];
    expect(parseCoordinates('44.1162, 24.9622\n44.1162, 24.9632\n44.1172, 24.9632')).toEqual({ ok: true, points: want });
    expect(parseCoordinates('24,9622 44,1162\n24,9632\t44,1162\n24,9632;44,1172\n24,9622 44,1162')).toEqual({ ok: true, points: want });
    expect(parseCoordinates('44.1162 24.9622\n\n 44.1162 24.9632 \n44.1172 24.9632')).toEqual({ ok: true, points: want });
    expect(parseCoordinates('44.1162, 24.9622\n44.1162, 24.9632')).toEqual({ ok: false, error: 'too_few' });
    expect(parseCoordinates('44.1162, 24.9622\nla pădure\n1,2')).toEqual({ ok: false, error: 'unreadable', line: 2 });
    // Stereo 70 metres, or a place outside Romania.
    expect(parseCoordinates('512345 345678\n1 2\n3 4')).toEqual({ ok: false, error: 'outside_romania', line: 1 });
  });
});

describe('the tools', () => {
  it('drags and nudges a corner, in metres', () => {
    const s = square(100);
    const moved = nudgeVertex(s, 2, 10, 0);
    expect(metresBetween(s.vertices[2]!.at, moved.vertices[2]!.at)).toBeCloseTo(10, 1);
    expect(area(moved)).toBeGreaterThan(area(s));
    expect(moveVertex(s, 0, [24.96, 44.11]).vertices[0]!.at).toEqual([24.96, 44.11]);
  });

  it('adds a corner in the middle of an edge, and deletes one, never below 3', () => {
    const s = insertVertex(square(100), 0);
    expect(s.vertices).toHaveLength(5);
    expect(metresBetween(s.vertices[0]!.at, s.vertices[1]!.at)).toBeCloseTo(50, 0);
    expect(area(s)).toBe(area(square(100)));
    const back = deleteVertex(s, 1);
    expect(back.vertices).toHaveLength(4);
    expect(area(back)).toBe(area(square(100)));
    const triangle = deleteVertex(square(100), 3);
    expect(deleteVertex(triangle, 0)).toBe(triangle);
  });

  it('bows an edge outward, and back', () => {
    const s = square(100);
    const curved = makeCurve(s, 0);
    expect(curved.edges[0]!.type).toBe('quad');
    // The south edge bows south, by a tenth of 100 m: about 10 m at its middle.
    const mid = pointOnEdge(curved, 0, 0.5);
    expect(metresBetween(pointOnEdge(s, 0, 0.5), mid)).toBeCloseTo(10, 0);
    expect(mid[1]).toBeLessThan(s.vertices[0]!.at[1]);
    // A parabolic bow of 10 m over 100 m adds 2/3 × 100 × 10 m² ≈ 6.7 ari.
    expect(area(curved) - area(s)).toBeGreaterThanOrEqual(6);
    expect(area(curved) - area(s)).toBeLessThanOrEqual(7);
    expect(makeStraight(curved, 0)).toEqual(s);
    expect(makeCurve(curved, 0)).toBe(curved);
  });

  it('splitting a curved edge keeps the outline; dragging a handle changes it', () => {
    const curved = makeCurve(square(100), 0);
    const split = insertVertex(curved, 0);
    expect(split.edges.slice(0, 2).map((e) => e.type)).toEqual(['quad', 'quad']);
    expect(Math.abs(area(split) - area(curved))).toBeLessThanOrEqual(1);
    const pulled = moveHandle(curved, 0, 0, pointOnEdge(square(100), 0, 0.5));
    expect(area(pulled)).toBe(area(square(100)));
  });

  it('rounds a corner within what the edges allow', () => {
    const s = square(100);
    // A right angle: 45% of 100 m × tan(45°), rounded down (the sides are a hair under 100 m after rounding).
    const max = maxCornerM(s, 0);
    expect(max).toBeGreaterThanOrEqual(44);
    expect(max).toBeLessThanOrEqual(45);
    const round = setCorner(s, 0, 20);
    expect(round.vertices[0]!.cornerM).toBe(20);
    // (1 − π/4) × 20² ≈ 86 m² cut away.
    expect(area(s) - area(round)).toBe(1);
    expect(setCorner(s, 0, 500).vertices[0]!.cornerM).toBe(max);
    expect(setCorner(round, 0, 0).vertices[0]).not.toHaveProperty('cornerM');
  });

  it('snaps to the bloc within 3 m, corners first, and not from further away', () => {
    const outline = flattenShape(square(100), SEG);
    const f = metreFrame(square(100).vertices[0]!.at);
    const near = f.toLngLat({ x: 50, y: 2 });
    expect(metresBetween(snapTo(near, outline), f.toLngLat({ x: 50, y: 0 }))).toBeLessThan(0.05);
    const nearCorner = f.toLngLat({ x: 2, y: 1.5 });
    expect(metresBetween(snapTo(nearCorner, outline), f.toLngLat({ x: 0, y: 0 }))).toBeLessThan(0.05);
    const far = f.toLngLat({ x: 50, y: 5 });
    expect(snapTo(far, outline)).toEqual(far);
    expect(snapTo(far, null)).toEqual(far);
  });
});

describe('checks and undo', () => {
  it('compares the live area with the paper, and catches crossed edges', () => {
    const s = square(100);
    expect(checkShape(s, SEG, 100, WARN)).toMatchObject({ areaAri: 100, simple: true, areaWarning: false, diffAri: 0 });
    expect(checkShape(s, SEG, 80, WARN)).toMatchObject({ areaWarning: true, diffAri: 20 });
    expect(checkShape(s, SEG, null, WARN)).toMatchObject({ areaWarning: false, diffAri: null });
    const [a, b, c, d] = s.vertices.map((v) => v.at) as [Position, Position, Position, Position];
    expect(checkShape(shapeFromPoints([a, c, b, d]), SEG, 100, WARN).simple).toBe(false);
    expect(centroid(checkShape(s, SEG, null, WARN).geometry)[1]).toBeGreaterThan(44.11);
  });

  it('undoes and redoes, and a new step drops what was undone', () => {
    let h = historyOf(square(100));
    const one = nudgeVertex(h.present, 0, 1, 0);
    h = pushHistory(h, one);
    h = pushHistory(h, one);
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present).toEqual(square(100));
    h = redo(h);
    expect(h.present).toBe(one);
    h = pushHistory(undo(h), makeCurve(h.present, 1));
    expect(h.future).toEqual([]);
    expect(undo(historyOf(1))).toEqual(historyOf(1));
  });
});
