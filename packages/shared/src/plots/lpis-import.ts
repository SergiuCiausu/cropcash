/* The bulk copy of a county's blocs (docs/harta-plan.md, step 1b): the questions that page through
   APIA's layer, and the row each bloc becomes in lpis_blocs. Areas are kept as whole square metres,
   never as floats. Pure: scripts/import-geo/lpis.ts asks, caches and writes. */
import { z } from 'zod';
import { isLpisCounty } from './lpis';
import { PlotGeometrySchema, type PlotGeometry } from './model';

/** APIA answers at most this many features per question (lpis.json max_record_count). */
export const LPIS_PAGE = 1000;
const FIELDS = 'fbid,siruta,judet,nume_com,fol_pr_trn,fol_sec_tr,aria_neta';

const query = (service: string, params: Record<string, string>) =>
  `${service}/query?${Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')}`;

function checkCounty(county: string) {
  if (!isLpisCounty(county)) throw new Error('bad county');
}

/** How many blocs a county has. Asked first, so a run that got fewer knows it isn't complete. */
export function countyCountQuery(service: string, county: string): string {
  checkCounty(county);
  return query(service, { where: `judet='${county}'`, returnCountOnly: 'true', f: 'json' });
}

/** One page of a county's blocs, in a fixed order, so pages never overlap. */
export function countyPageQuery(service: string, county: string, offset: number): string {
  checkCounty(county);
  if (!Number.isInteger(offset) || offset < 0) throw new Error('bad offset');
  return query(service, {
    where: `judet='${county}'`,
    outFields: FIELDS,
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(LPIS_PAGE),
    outSR: '4326',
    geometryPrecision: '6',
    f: 'geojson',
  });
}

export function parseCount(answer: unknown): number {
  const parsed = z.object({ count: z.number().int().nonnegative() }).safeParse(answer);
  if (!parsed.success) throw new Error('not an LPIS count');
  return parsed.data.count;
}

/** A row of lpis_blocs, before the village is worked out. */
export interface LpisBlocRow {
  fbid: string;
  siruta: number;
  county: string;
  uat_name: string;
  land_use: string | null;
  land_use_2: string | null;
  net_area_m2: number;
  geometry: PlotGeometry;
}

const FBID = /^(\d{1,6})-([0-9A-Za-z/]{1,20})$/;
const Props = z.object({
  fbid: z.string(),
  judet: z.string().nullable().optional(),
  nume_com: z.string().nullable().optional(),
  fol_pr_trn: z.string().nullable().optional(),
  fol_sec_tr: z.string().nullable().optional(),
  aria_neta: z.number().nonnegative(),
});

export interface ParsedPage {
  rows: LpisBlocRow[];
  /** Features that can't be stored as they are, with why: they go into the report, never guessed at. */
  skipped: { fbid: string | null; why: 'bad_fbid' | 'no_area' | 'bad_geometry' | 'no_county' }[];
}

/** One GeoJSON page. `county` is the one asked for; a feature that names another is skipped. */
export function parseBlocPage(answer: unknown, county: string): ParsedPage {
  const parsed = z.object({ features: z.array(z.object({ geometry: z.unknown(), properties: z.record(z.string(), z.unknown()).nullable() })) }).safeParse(answer);
  if (!parsed.success) throw new Error('not an LPIS page');
  const out: ParsedPage = { rows: [], skipped: [] };
  for (const f of parsed.data.features) {
    const raw = f.properties ?? {};
    const fbid = typeof raw.fbid === 'string' ? raw.fbid.trim() : null;
    const id = fbid ? FBID.exec(fbid) : null;
    if (!fbid || !id) {
      out.skipped.push({ fbid, why: 'bad_fbid' });
      continue;
    }
    const p = Props.safeParse(raw);
    if (!p.success) {
      out.skipped.push({ fbid, why: 'no_area' });
      continue;
    }
    if ((p.data.judet?.trim() || county) !== county) {
      out.skipped.push({ fbid, why: 'no_county' });
      continue;
    }
    const g = PlotGeometrySchema.safeParse(f.geometry);
    if (!g.success) {
      out.skipped.push({ fbid, why: 'bad_geometry' });
      continue;
    }
    out.rows.push({
      fbid,
      siruta: Number(id[1]),
      county,
      uat_name: p.data.nume_com?.trim() || '',
      land_use: p.data.fol_pr_trn?.trim() || null,
      land_use_2: p.data.fol_sec_tr?.trim() || null,
      // aria_neta is in hectares.
      net_area_m2: Math.round(p.data.aria_neta * 10_000),
      geometry: g.data,
    });
  }
  return out;
}

/** The pages a county needs, from its count. */
export const pageOffsets = (count: number) => Array.from({ length: Math.ceil(count / LPIS_PAGE) }, (_, i) => i * LPIS_PAGE);
