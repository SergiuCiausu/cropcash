/* Finding a parcel on the map from APIA's public LPIS service (docs/data/lpis.json, docs/harta-plan.md
   step 4). This file only builds the questions and reads the answers; the API asks them and caches the
   answers. The service takes only equality and spatial queries (a LIKE gets 403), so every value put
   into a `where` is checked against a strict pattern first. */
import { z } from 'zod';
import lpisInfo from '../../../../docs/data/lpis.json';
import { centroid } from './geometry';
import { PlotGeometrySchema, PositionSchema, type GeometrySource, type PlotGeometry, type Position } from './model';

/** One bloc fizic as APIA has it. A bloc is not a parcel: one bloc can hold several farmers. */
export interface LpisBloc {
  fbid: string;
  siruta: number;
  bloc: string;
  /** County code, as APIA writes it (TR, CT). */
  county: string | null;
  /** The UAT's name as APIA writes it, without diacritics. */
  commune: string | null;
  landUse: string | null;
  /** Net area of the whole bloc. */
  netAreaAri: number | null;
  geometry: PlotGeometry;
  /** From the local copy (step 1b, lpis_blocs) only: the commune it belongs to, and the village it lies by. */
  uatSiruta?: number | null;
  villageSiruta?: number | null;
  villageMethod?: 'only_village' | 'inside_locality' | 'nearest' | 'paper' | null;
  villageDistanceM?: number | null;
}

/** A commune or town (UAT) with blocs in LPIS. */
export interface LpisCommune {
  siruta: number;
  name: string;
}

/**
 * A raster tile URL for MapLibre with every bloc's outline only, no fill and no labels, as a guide while
 * drawing ("Blocuri APIA"). `rgb` is the line colour. The `{bbox-epsg-3857}` placeholder is MapLibre's.
 */
export function lpisOverlayTiles(service: string, rgb: readonly [number, number, number]): string {
  const mapServer = service.replace(/\/\d+$/, '');
  const dynamicLayers = JSON.stringify([
    {
      id: 0,
      source: { type: 'mapLayer', mapLayerId: 0 },
      drawingInfo: {
        renderer: { type: 'simple', symbol: { type: 'esriSFS', style: 'esriSFSNull', outline: { type: 'esriSLS', style: 'esriSLSSolid', color: [...rgb, 230], width: 1.5 } } },
        showLabels: false,
      },
    },
  ]);
  return `${mapServer}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&dynamicLayers=${encodeURIComponent(dynamicLayers)}`;
}

const FBID = /^(\d{1,6})-([0-9A-Za-z/]{1,20})$/;
const COUNTY = /^[A-Z]{1,2}$/;

/** APIA's LPIS layer, as checked in docs/data/lpis.json. */
export const LPIS_SERVICE_URL: string = lpisInfo.service_url;

export const fbidOf = (siruta: number, bloc: string) => `${siruta}-${bloc}`;
export const isFbid = (s: string) => FBID.test(s);
export const isLpisCounty = (s: string) => COUNTY.test(s);

const query = (service: string, params: Record<string, string>) =>
  `${service}/query?${Object.entries({ ...params, f: params.f ?? 'json' })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')}`;

/** The questions asked of the service at `service` (lpis.json service_url). */
export function lpisQueries(service: string) {
  return {
    /** The bloc with this id, with its outline. */
    bloc(fbid: string): string {
      if (!isFbid(fbid)) throw new Error('bad fbid');
      return query(service, { where: `fbid='${fbid}'`, outFields: 'fbid,siruta,judet,nume_com,fol_pr_trn,aria_neta', outSR: '4326', geometryPrecision: '6', f: 'geojson' });
    },
    /** The blocs under a point, with their outlines. */
    at([lng, lat]: Position): string {
      PositionSchema.parse([lng, lat]);
      return query(service, {
        geometry: `${lng.toFixed(6)},${lat.toFixed(6)}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'fbid,siruta,judet,nume_com,fol_pr_trn,aria_neta',
        outSR: '4326',
        geometryPrecision: '6',
        f: 'geojson',
      });
    },
    /** Every UAT of a county that has blocs. */
    communes(county: string): string {
      if (!isLpisCounty(county)) throw new Error('bad county');
      return query(service, { where: `judet='${county}'`, outFields: 'siruta,nume_com', returnDistinctValues: 'true', returnGeometry: 'false', orderByFields: 'nume_com' });
    },
    /** The box around all of a UAT's blocs, to place a parcel roughly when its bloc can't be found. */
    communeExtent(siruta: number): string {
      if (!Number.isInteger(siruta) || siruta <= 0 || siruta > 999_999) throw new Error('bad siruta');
      return query(service, { where: `siruta=${siruta}`, returnExtentOnly: 'true', outSR: '4326' });
    },
  };
}

const Props = z.object({
  fbid: z.string(),
  siruta: z.number().int().nullable().optional(),
  judet: z.string().nullable().optional(),
  nume_com: z.string().nullable().optional(),
  fol_pr_trn: z.string().nullable().optional(),
  aria_neta: z.number().nullable().optional(),
});
const BlocFeatures = z.object({
  features: z.array(z.object({ geometry: z.unknown(), properties: z.unknown() })),
});

/** The blocs in a GeoJSON answer. Features that don't parse are left out, never guessed at. */
export function parseBlocs(answer: unknown): LpisBloc[] {
  const parsed = BlocFeatures.safeParse(answer);
  if (!parsed.success) throw new Error('not an LPIS answer');
  return parsed.data.features.flatMap((f) => {
    const props = Props.safeParse(f.properties);
    const geometry = PlotGeometrySchema.safeParse(f.geometry);
    const id = props.success ? FBID.exec(props.data.fbid) : null;
    if (!props.success || !geometry.success || !id) return [];
    const p = props.data;
    return [
      {
        fbid: p.fbid,
        siruta: Number(id[1]),
        bloc: id[2]!,
        county: p.judet?.trim() || null,
        commune: p.nume_com?.trim() || null,
        landUse: p.fol_pr_trn?.trim() || null,
        // aria_neta is in hectares.
        netAreaAri: p.aria_neta == null ? null : Math.round(p.aria_neta * 100),
        geometry: geometry.data,
      },
    ];
  });
}

/** "MALDAENI" -> "Maldaeni", "PLOPII-SLAVITESTI" -> "Plopii-Slavitesti". APIA writes names without diacritics. */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/** The UATs in a distinct-values answer, by name. */
export function parseCommunes(answer: unknown): LpisCommune[] {
  const parsed = z
    .object({ features: z.array(z.object({ attributes: z.object({ siruta: z.number().int().positive(), nume_com: z.string().min(1) }) })) })
    .safeParse(answer);
  if (!parsed.success) throw new Error('not an LPIS answer');
  const seen = new Map<number, LpisCommune>();
  for (const { attributes: a } of parsed.data.features) {
    if (!seen.has(a.siruta)) seen.set(a.siruta, { siruta: a.siruta, name: titleCase(a.nume_com.trim()) });
  }
  return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name, 'ro'));
}

const Edge = z.union([z.number(), z.literal('NaN').transform(() => Number.NaN)]);

/** The middle of an extent answer, or null when the UAT has no blocs. */
export function parseExtentCentre(answer: unknown): Position | null {
  const parsed = z
    // A UAT with no blocs answers "NaN" strings for every edge.
    .object({ count: z.number().optional(), extent: z.object({ xmin: Edge, ymin: Edge, xmax: Edge, ymax: Edge }).nullable() })
    .safeParse(answer);
  if (!parsed.success) throw new Error('not an LPIS answer');
  const e = parsed.data.extent;
  if (!e || parsed.data.count === 0 || ![e.xmin, e.ymin, e.xmax, e.ymax].every(Number.isFinite)) return null;
  const centre: Position = [Math.round(((e.xmin + e.xmax) / 2) * 1e6) / 1e6, Math.round(((e.ymin + e.ymax) / 2) * 1e6) / 1e6];
  return PositionSchema.safeParse(centre).success ? centre : null;
}

/** Strips accents and case, so "Măldăeni" finds APIA's "Maldaeni". */
export const plainName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

/** UATs whose name contains `q`, ignoring accents; those starting with it first. */
export function searchCommunes(list: readonly LpisCommune[], q: string, limit = 20): LpisCommune[] {
  const needle = plainName(q);
  if (!needle) return list.slice(0, limit);
  const hits = list.filter((c) => plainName(c.name).includes(needle) || String(c.siruta) === needle);
  return hits.sort((a, b) => Number(!plainName(a.name).startsWith(needle)) - Number(!plainName(b.name).startsWith(needle))).slice(0, limit);
}

/** Where a parcel goes on the map, and how sure we are. */
export interface MapPlacement {
  source: GeometrySource;
  geometry: PlotGeometry | null;
  /** Set only when there is no outline: the rough middle, drawn dashed. */
  centre: Position | null;
  /**
   * whole: the parcel is the whole bloc (areas agree within area_warning_pct).
   * in_bloc: somewhere inside this bloc, to narrow down by drawing.
   * in_commune: somewhere in the UAT. none: not on the map.
   */
  fit: 'whole' | 'in_bloc' | 'in_commune' | 'none';
  bloc: LpisBloc | null;
}

/**
 * The order of docs/harta-plan.md step 4: the bloc, else the UAT's middle, else nothing. A parcel is
 * never shown with confidence where it isn't: only a bloc whose area matches the parcel's counts as
 * its outline (`lpis`); a bigger bloc is shown as "somewhere in here" (`approx`).
 */
export function placeParcel(parcelAri: number | null, bloc: LpisBloc | null, communeCentre: Position | null, warnPct: number): MapPlacement {
  if (bloc) {
    const whole = !!parcelAri && !!bloc.netAreaAri && (Math.abs(bloc.netAreaAri - parcelAri) / bloc.netAreaAri) * 100 <= warnPct;
    return { source: whole ? 'lpis' : 'approx', geometry: bloc.geometry, centre: null, fit: whole ? 'whole' : 'in_bloc', bloc };
  }
  if (communeCentre) return { source: 'approx', geometry: null, centre: communeCentre, fit: 'in_commune', bloc: null };
  return { source: 'none', geometry: null, centre: null, fit: 'none', bloc: null };
}

/** The middle of a placement, for flying the map there. */
export const placementCentre = (p: MapPlacement): Position | null => (p.geometry ? centroid(p.geometry) : p.centre);
