/* „Blocuri APIA” as outlines the farmer can tap (docs/harta-plan.md): the map asks for APIA's blocs one
   square at a time, on a fixed grid, so the same square is asked once and cached (on the server, then in the
   page). The grid is the usual web-map one at zoom LPIS_TILE_ZOOM: about 1,8 km a side in Romania, which
   holds a few dozen blocs. */

/** The grid the blocs are asked on. */
export const LPIS_TILE_ZOOM = 14;
/** More squares than this on screen and none are asked: the map is too far out to tell blocs apart. */
export const LPIS_MAX_TILES = 24;

export interface LngLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface LpisTile {
  x: number;
  y: number;
}

const SIDE = 2 ** LPIS_TILE_ZOOM;
const lngToX = (lng: number) => Math.floor(((lng + 180) / 360) * SIDE);
function latToY(lat: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * SIDE);
}
const xToLng = (x: number) => (x / SIDE) * 360 - 180;
const yToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / SIDE))) * 180) / Math.PI;

/** A square of the grid, as a valid one: whole numbers inside the grid. */
export const isLpisTile = (t: LpisTile) => Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.y >= 0 && t.x < SIDE && t.y < SIDE;

/** The lng/lat box of a square, rounded to 6 decimals so the question to APIA is the same each time. */
export function lpisTileBox({ x, y }: LpisTile): LngLatBox {
  if (!isLpisTile({ x, y })) throw new Error('bad tile');
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { west: r(xToLng(x)), south: r(yToLat(y + 1)), east: r(xToLng(x + 1)), north: r(yToLat(y)) };
}

/** The squares covering a box, middle first, or none when there are more than `max`. */
export function lpisTilesFor(box: LngLatBox, max = LPIS_MAX_TILES): LpisTile[] {
  const x0 = lngToX(box.west);
  const x1 = lngToX(box.east);
  const y0 = latToY(box.north);
  const y1 = latToY(box.south);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > max) return [];
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const out: LpisTile[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (isLpisTile({ x, y })) out.push({ x, y });
  return out.sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my));
}

export const lpisTileKey = ({ x, y }: LpisTile) => `${x}/${y}`;
