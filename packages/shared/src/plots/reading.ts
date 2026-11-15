/* The parcels on a cerere de plată, section II.A "Declarație de suprafață": one row per parcel, with
   where it is (județ, localitate, SIRUTA, bloc fizic, parcel number) and its main crop. The AI copies
   the text as printed (DocumentExtractionSchema); this turns it into checked values and then into
   what save_plots takes. Nothing is saved here. See docs/harta-plan.md, step 2. */
import type { AppData } from '../data';
import { countyFromText, parseAreaText } from '../documents/index';
import type { MapPlacement } from './lpis';
import type { RowMatch, SeasonRow } from './match';
import type { PlotInput } from './model';

/** The fields of one II.A row as printed, beside the crop fields the reader already had. */
export interface PrintedPlotRow {
  code: string | null;
  crop_id: string | null;
  name: string;
  area: string;
  judet?: string | null;
  localitate?: string | null;
  siruta?: string | null;
  bloc_fizic?: string | null;
  parcel_no?: string | null;
  farmer_code?: string | null;
  land_use?: string | null;
}

export type PaperPlotIssue = 'no_area' | 'no_siruta' | 'no_bloc' | 'no_parcel_no' | 'unknown_crop' | 'duplicate';

export interface PaperPlot {
  /** The row's place on the paper, from 0. */
  row: number;
  county: string | null;
  /** The locality as printed, tidied, for the farmer to recognise. */
  locality: string | null;
  siruta: number | null;
  blocFizic: string | null;
  parcelNo: string | null;
  farmerCode: string | null;
  landUse: string | null;
  /** "<SIRUTA>-<bloc>", the id of the bloc in APIA's LPIS (docs/data/lpis.json). */
  lpisFbid: string | null;
  cropId: string | null;
  cropName: string;
  apiaCode: number | null;
  areaAri: number | null;
  issues: PaperPlotIssue[];
}

const clean = (s: string | null | undefined, max: number) => {
  const t = s?.replace(/\s+/g, ' ').trim() ?? '';
  return t ? t.slice(0, max) : null;
};

/** SIRUTA codes are up to 6 digits. */
function sirutaOf(text: string | null | undefined): number | null {
  const digits = text?.replace(/\s/g, '') ?? '';
  return /^\d{1,6}$/.test(digits) && Number(digits) > 0 ? Number(digits) : null;
}

/** "0286" and "286" are the same bloc; a bloc can carry a letter or a slash, nothing else (LPIS fbid). */
function blocOf(text: string | null | undefined): string | null {
  const t = text?.replace(/\s/g, '').replace(/^0+(?=\w)/, '') ?? '';
  return /^[0-9A-Za-z/]{1,20}$/.test(t) ? t : null;
}

/** "1 A" -> "1a", as APIA writes it ("1a; 1b; 1c"). */
function parcelNoOf(text: string | null | undefined): string | null {
  const t = text?.replace(/\s/g, '').toLowerCase() ?? '';
  return /^[0-9a-z/-]{1,10}$/.test(t) ? t : null;
}

/** Land use codes on the cerere: TA, PP, CP, VI, LV and the like. */
function landUseOf(text: string | null | undefined): string | null {
  const t = text?.replace(/\s/g, '').toUpperCase() ?? '';
  return /^[A-Z]{2,4}$/.test(t) ? t : null;
}

/** "MĂLDĂENI" -> "Măldăeni"; text in mixed case stays as written. */
function localityOf(text: string | null | undefined): string | null {
  const t = clean(text, 60);
  if (!t || t !== t.toLocaleUpperCase('ro')) return t;
  return t.toLocaleLowerCase('ro').replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('ro'));
}

/**
 * Checked parcels from the printed II.A rows. A crop is matched by its APIA code only when there is
 * one (crops-reference.json `apia_codes`), else by the AI's crop id. Nothing is guessed: what can't be
 * read is null and listed in `issues`, so the farmer sees it before saving.
 */
export function readPaperPlots(rows: readonly PrintedPlotRow[], data: AppData): PaperPlot[] {
  const known = new Set(data.crops.crops.map((c) => c.id));
  const byCode = new Map(data.crops.crops.flatMap((c) => (c.apia_codes ?? []).map((code) => [code, c.id] as const)));
  const seen = new Set<string>();
  return rows.map((r, row) => {
    const code = r.code?.trim() ?? '';
    const apiaCode = /^\d+$/.test(code) ? Number(code) : null;
    const cropId = apiaCode !== null ? (byCode.get(apiaCode) ?? null) : r.crop_id && known.has(r.crop_id) ? r.crop_id : null;
    const siruta = sirutaOf(r.siruta);
    const blocFizic = blocOf(r.bloc_fizic);
    const parcelNo = parcelNoOf(r.parcel_no);
    const areaAri = parseAreaText(r.area);
    const issues: PaperPlotIssue[] = [];
    if (!areaAri) issues.push('no_area');
    if (siruta === null) issues.push('no_siruta');
    if (!blocFizic) issues.push('no_bloc');
    if (!parcelNo) issues.push('no_parcel_no');
    if (!cropId) issues.push('unknown_crop');
    if (siruta !== null && blocFizic && parcelNo) {
      const key = `${siruta}|${blocFizic.toLowerCase()}|${parcelNo}`;
      if (seen.has(key)) issues.push('duplicate');
      seen.add(key);
    }
    return {
      row,
      county: countyFromText(r.judet ?? null, data),
      locality: localityOf(r.localitate),
      siruta,
      blocFizic,
      parcelNo,
      farmerCode: clean(r.farmer_code, 20),
      landUse: landUseOf(r.land_use),
      lpisFbid: siruta !== null && blocFizic ? `${siruta}-${blocFizic}` : null,
      cropId,
      cropName: clean(r.name, 80) ?? '',
      apiaCode,
      areaAri,
      issues,
    };
  });
}

/** What matchSeasonRows needs from a paper parcel. */
export const seasonRowOf = (p: PaperPlot): SeasonRow => ({ siruta: p.siruta, blocFizic: p.blocFizic, parcelNo: p.parcelNo });

/** Can be saved: has an area and isn't a second copy of a row above it. */
export const isSavable = (p: PaperPlot) => !!p.areaAri && !p.issues.includes('duplicate');

/**
 * The parcels to save from a paper. `matches` are matchSeasonRows' answers for the same rows;
 * `sameAsAsked` holds the rows where the farmer said "it's the same parcel" to an `ask`.
 * `county` fills a row whose județ couldn't be read. Rows that can't be saved are left out.
 */
export function paperPlotsToInputs(
  plots: readonly PaperPlot[],
  matches: readonly RowMatch[],
  options: {
    county: string;
    sameAsAsked?: ReadonlySet<number>;
    skip?: ReadonlySet<number>;
    /** Where each row was found on the map (by row). */
    placements?: Readonly<Record<number, MapPlacement>>;
    /** Parcels already placed on the map. They keep their place: the farmer may have drawn it. */
    placed?: ReadonlySet<string>;
  },
): PlotInput[] {
  return plots.flatMap((p, i) => {
    if (!isSavable(p) || options.skip?.has(p.row)) return [];
    const m = matches[i] ?? { kind: 'new' };
    const id = m.kind === 'same' || (m.kind === 'ask' && options.sameAsAsked?.has(p.row)) ? m.plotId : undefined;
    const input: PlotInput = {
      ...(id ? { id } : {}),
      county: p.county ?? options.county,
      siruta: p.siruta,
      blocFizic: p.blocFizic,
      parcelNo: p.parcelNo,
      lpisFbid: p.lpisFbid,
      landUse: p.landUse,
      season: { cropId: p.cropId, apiaCropCode: p.apiaCode, areaAri: p.areaAri! },
    };
    const placed = options.placements?.[p.row];
    if (placed && placed.fit !== 'none' && !(id && options.placed?.has(id))) {
      input.geometrySource = placed.source;
      if (placed.geometry) input.geometry = placed.geometry;
      else input.centre = placed.centre;
    }
    return [input];
  });
}
