import { describe, expect, it } from 'vitest';
import { lpisQueries } from './lpis';
import { isLpisTile, LPIS_MAX_TILES, lpisTileBox, lpisTileKey, lpisTilesFor } from './lpis-tiles';

// Măldăeni, Teleorman: Ion's bloc 286 is around 24.96, 44.11.
const MALDAENI = { west: 24.955, south: 44.105, east: 24.965, north: 44.115 };

describe('the bloc grid', () => {
  it('covers a box with the squares it touches, and each square holds its own corner', () => {
    const tiles = lpisTilesFor(MALDAENI);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
    for (const t of tiles) {
      const b = lpisTileBox(t);
      expect(b.west).toBeLessThan(b.east);
      expect(b.south).toBeLessThan(b.north);
      // One square of the zoom-14 grid, about 1,8 km wide here.
      expect(b.east - b.west).toBeCloseTo(360 / 2 ** 14, 5);
    }
    const union = tiles.map(lpisTileBox).reduce((a, b) => ({ west: Math.min(a.west, b.west), south: Math.min(a.south, b.south), east: Math.max(a.east, b.east), north: Math.max(a.north, b.north) }));
    expect(union.west).toBeLessThanOrEqual(MALDAENI.west);
    expect(union.east).toBeGreaterThanOrEqual(MALDAENI.east);
    expect(union.south).toBeLessThanOrEqual(MALDAENI.south);
    expect(union.north).toBeGreaterThanOrEqual(MALDAENI.north);
  });

  it('asks the middle first, and nothing when the map is too far out', () => {
    const wide = { west: 24.9, south: 44.08, east: 25.02, north: 44.14 };
    const tiles = lpisTilesFor(wide, 100);
    const mid = lpisTilesFor({ west: 24.96, south: 44.11, east: 24.96, north: 44.11 })[0]!;
    expect(Math.abs(tiles[0]!.x - mid.x)).toBeLessThanOrEqual(1);
    expect(lpisTilesFor({ west: 22, south: 43.6, east: 28, north: 48 })).toEqual([]);
    expect(lpisTilesFor(wide, LPIS_MAX_TILES).length).toBeLessThanOrEqual(LPIS_MAX_TILES);
  });

  it('refuses squares off the grid', () => {
    expect(isLpisTile({ x: 1.5, y: 2 })).toBe(false);
    expect(isLpisTile({ x: -1, y: 2 })).toBe(false);
    expect(isLpisTile({ x: 2 ** 14, y: 0 })).toBe(false);
    expect(() => lpisTileBox({ x: -1, y: 0 })).toThrow();
    expect(lpisTileKey({ x: 9327, y: 5932 })).toBe('9327/5932');
  });

  it('asks APIA for one square as an envelope, the same question each time', () => {
    const t = lpisTilesFor(MALDAENI)[0]!;
    const url = lpisQueries('https://apia.example/MapServer/0').tile(t);
    expect(url).toBe(lpisQueries('https://apia.example/MapServer/0').tile({ ...t }));
    const param = (k: string) => decodeURIComponent(new RegExp(`[?&]${k}=([^&]*)`).exec(url)![1]!);
    expect(param('geometryType')).toBe('esriGeometryEnvelope');
    expect(param('f')).toBe('geojson');
    const [w, s, e, n] = param('geometry').split(',').map(Number);
    expect(lpisTileBox(t)).toEqual({ west: w, south: s, east: e, north: n });
  });
});
