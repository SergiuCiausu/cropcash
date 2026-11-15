/* The cartoon map style (docs/harta-plan.md, step 7): OpenFreeMap's „liberty” recoloured in warm pastels,
   with farmland, a soft hillshade, the globe and a hazy sky. Pure: it takes the style JSON and returns a
   new one. Without the style (no internet) the map still gets a plain background, so parcels show. */
import { LAND } from './palette';

/** OpenFreeMap: free vector tiles, no key (docs/harta-plan.md, decision 4). */
export const BASE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
/**
 * Elevation for the soft hillshade (no 3D terrain: with it, fitBounds at a pitch lands wrongly in MapLibre 5.24, and the plain is flat anyway): Mapzen's Terrain Tiles on AWS Open Data, free and without a key.
 * Teleorman is flat, so this only softens the land; the map works without it.
 */
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_ATTRIBUTION = '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen Terrain Tiles</a>';

/** MapTiler satellite (decision 5); only with a key, which the „Satelit” toggle needs. */
export const satelliteTiles = (key: string) => `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`;
export const SATELLITE_ATTRIBUTION = '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>';

/** As much of a MapLibre style as this file touches. */
export interface StyleLayer {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  filter?: unknown;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface StyleJson {
  version: 8;
  sources: Record<string, Record<string, unknown>>;
  layers: StyleLayer[];
  glyphs?: string;
  sprite?: unknown;
  projection?: { type: string };
  sky?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface CartoonOptions {
  /** The globe at low zoom, for the opening flight. */
  globe: boolean;
  /** The soft hillshade (needs the elevation tiles). */
  hillshade: boolean;
}

/** The colour changes for one base layer, by its id in „liberty”. */
function recolour(l: StyleLayer): Record<string, unknown> | null {
  const id = l.id;
  if (l.type === 'background') return { 'background-color': LAND.land };
  if (l.type === 'raster') return { 'raster-saturation': -0.55, 'raster-brightness-min': 0.35, 'raster-opacity': 0.6 };
  if (l.type === 'symbol') return { 'text-color': LAND.text, 'text-halo-color': LAND.halo, 'text-halo-width': 1.5 };
  if (l.type === 'fill-extrusion') return { 'fill-extrusion-color': LAND.building, 'fill-extrusion-opacity': 0.55 };
  if (l.type === 'fill') {
    if (id === 'water') return { 'fill-color': LAND.water };
    if (id === 'building') return { 'fill-color': LAND.building, 'fill-outline-color': LAND.boundary };
    if (/wood/.test(id)) return { 'fill-color': LAND.wood };
    if (/park|grass|wetland|pitch|cemetery/.test(id)) return { 'fill-color': LAND.green };
    if (/sand/.test(id)) return { 'fill-color': LAND.sand };
    if (/ice/.test(id)) return { 'fill-color': '#FFFFFF' };
    if (/residential|hospital|school|track/.test(id)) return { 'fill-color': '#F7EEE6' };
    if (/aeroway|road_area/.test(id)) return { 'fill-color': '#F1EAF6' };
    return null;
  }
  if (l.type === 'line') {
    if (/^waterway/.test(id)) return { 'line-color': LAND.waterLine };
    if (/^boundary/.test(id)) return { 'line-color': LAND.boundary };
    if (/park_outline/.test(id)) return { 'line-color': LAND.wood };
    if (/rail/.test(id)) return { 'line-color': LAND.rail };
    if (/casing/.test(id)) return { 'line-color': LAND.roadCasing };
    if (/path_pedestrian/.test(id)) return { 'line-color': '#EADCF2' };
    if (/aeroway/.test(id)) return { 'line-color': '#E6DCF0' };
    if (/^(road|tunnel|bridge)_/.test(id)) return { 'line-color': LAND.road };
    return null;
  }
  return null;
}

/** Place and water names in Romanian where the tiles have it, else in Latin letters, else as written there. */
export const ROMANIAN_NAME = ['coalesce', ['get', 'name:ro'], ['get', 'name:latin'], ['get', 'name']];
const PLACE_LABEL = /^(label_|water_name|waterway_line_label)/;

const FARMLAND: StyleLayer = {
  id: 'cc-farmland',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landcover',
  filter: ['==', ['get', 'class'], 'farmland'],
  paint: { 'fill-color': LAND.farmland },
};

const HILLSHADE: StyleLayer = {
  id: 'cc-hillshade',
  type: 'hillshade',
  source: 'cc-dem',
  paint: { 'hillshade-shadow-color': LAND.shadow, 'hillshade-highlight-color': LAND.highlight, 'hillshade-accent-color': LAND.shadow, 'hillshade-exaggeration': 0.35 },
};

/** A pastel haze at the horizon, fading as the map comes down to the farm. */
export const SKY = {
  'sky-color': LAND.sky,
  'horizon-color': LAND.horizon,
  'fog-color': LAND.fog,
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.85,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
};

export function cartoonStyle(base: StyleJson | null, o: CartoonOptions): StyleJson {
  const style: StyleJson = base
    ? { ...base, sources: { ...base.sources }, layers: [] }
    : { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': LAND.land } }] };
  const layers = base
    ? base.layers.map((l) => {
        const paint = recolour(l);
        const next = paint ? { ...l, paint: { ...l.paint, ...paint } } : l;
        return PLACE_LABEL.test(l.id) ? { ...next, layout: { ...l.layout, 'text-field': ROMANIAN_NAME } } : next;
      })
    : style.layers;

  // Farmland and the hillshade go just above the background, under everything drawn on the land.
  const under: StyleLayer[] = [];
  if (base && base.sources.openmaptiles) under.push(FARMLAND);
  if (o.hillshade) {
    style.sources['cc-dem'] = { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: DEM_ATTRIBUTION };
    under.push(HILLSHADE);
  }
  const at = layers.findIndex((l) => l.type !== 'background' && l.type !== 'raster');
  style.layers = at < 0 ? [...layers, ...under] : [...layers.slice(0, at), ...under, ...layers.slice(at)];
  if (o.globe) style.projection = { type: 'globe' };
  style.sky = SKY;
  return style;
}

/** The first layer of the base map drawn over the land (labels), so parcels go under the names. */
export function firstLabelLayer(style: StyleJson): string | undefined {
  return style.layers.find((l) => l.type === 'symbol')?.id;
}
