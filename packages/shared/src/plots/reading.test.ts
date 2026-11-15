import { describe, expect, it } from 'vitest';
import params from '../../../../docs/data/plots-params.json';
import { loadData } from '../data';
import { normalizeReading, type DocumentExtraction } from '../documents/index';
import { plot } from './fixtures';
import { matchSeasonRows } from './match';
import { PlotInputSchema, PlotsParamsSchema } from './model';
import { isSavable, paperPlotsToInputs, readPaperPlots, seasonRowOf, type PrintedPlotRow } from './reading';

const data = loadData();
const MIN_OVERLAP = PlotsParamsSchema.parse(params).match_overlap_min.value;
const code = (id: string) => String(data.crops.crops.find((c) => c.id === id)!.apia_codes![0]);

/* Rows shaped like section II.A of the 2026 cerere (Monitorul Oficial 193 bis/2026, Anexa 1). */
const row = (over: Partial<PrintedPlotRow> = {}): PrintedPlotRow => ({
  code: code('grau'),
  crop_id: null,
  name: 'GRÂU COMUN DE TOAMNĂ',
  area: '8,00',
  judet: 'TELEORMAN',
  localitate: 'MĂLDĂENI',
  siruta: '153277',
  bloc_fizic: '0286',
  parcel_no: '1 A',
  farmer_code: null,
  land_use: 'ta',
  ...over,
});

describe('parcels read from II.A', () => {
  it('tidies every field and builds the LPIS bloc id', () => {
    const [p] = readPaperPlots([row()], data);
    expect(p).toEqual({
      row: 0,
      county: 'TR',
      locality: 'Măldăeni',
      siruta: 153277,
      blocFizic: '286',
      parcelNo: '1a',
      farmerCode: null,
      landUse: 'TA',
      lpisFbid: '153277-286',
      cropId: 'grau',
      cropName: 'GRÂU COMUN DE TOAMNĂ',
      apiaCode: Number(code('grau')),
      areaAri: 800,
      issues: [],
    });
  });

  it('a crop code we do not grow stays unknown, even if the AI guessed a crop', () => {
    const [p] = readPaperPlots([row({ code: '999999', crop_id: 'grau', name: 'PAJIȘTE', land_use: 'PP' })], data);
    expect(p!.cropId).toBeNull();
    expect(p!.issues).toEqual(['unknown_crop']);
  });

  it('lists what it could not read, and flags a second copy of a row', () => {
    const rows = readPaperPlots(
      [row({ siruta: 'ab', bloc_fizic: null, parcel_no: '', area: '' }), row(), row({ parcel_no: '1a' })],
      data,
    );
    expect(rows[0]!.issues).toEqual(['no_area', 'no_siruta', 'no_bloc', 'no_parcel_no']);
    expect(rows[0]!.lpisFbid).toBeNull();
    expect(rows[2]!.issues).toEqual(['duplicate']);
    expect(rows.map(isSavable)).toEqual([false, true, false]);
  });

  it('comes back from normalizeReading for a cerere, and only for a cerere', () => {
    const raw = (kind: DocumentExtraction['kind']): DocumentExtraction => ({
      kind,
      year: '2026',
      crops: [row(), row({ code: code('porumb'), name: 'PORUMB', area: '7', bloc_fizic: '293', parcel_no: '2a' })],
      amount: null,
      date: null,
      category: null,
      crop_id: null,
      applicant: null,
      total_area: '15,00',
    });
    const cerere = normalizeReading(raw('apia_cerere'), data, '2026-11-15');
    expect(cerere.plots?.map((p) => [p.lpisFbid, p.cropId, p.areaAri])).toEqual([
      ['153277-286', 'grau', 800],
      ['153277-293', 'porumb', 700],
    ]);
    // The crop totals onboarding uses are unchanged by the new fields.
    expect(cerere.parcels).toEqual([
      { cropId: 'grau', areaAri: 800 },
      { cropId: 'porumb', areaAri: 700 },
    ]);
    expect(normalizeReading(raw('apia_decizie'), data, '2026-11-15').plots).toBeUndefined();
  });
});

describe('from paper to save_plots', () => {
  const paper = readPaperPlots(
    [
      row(),
      row({ code: code('porumb'), area: '7', bloc_fizic: '293', parcel_no: '2a' }),
      row({ bloc_fizic: '400', parcel_no: '3', judet: null }),
      row({ area: 'x', bloc_fizic: '500' }),
    ],
    data,
  );
  const existing = [plot('old-286', { bloc_fizic: '286', parcel_no: '1a' }), plot('old-other', { bloc_fizic: '293', parcel_no: '9z' })];
  const matches = matchSeasonRows(paper.map(seasonRowOf), existing, MIN_OVERLAP);

  it('same parcel keeps its id, new ones have none, unreadable rows are left out', () => {
    const inputs = paperPlotsToInputs(paper, matches, { county: 'TR' });
    expect(inputs.map((i) => [i.id, i.blocFizic, i.season?.areaAri])).toEqual([
      ['old-286', '286', 800],
      [undefined, '293', 700],
      [undefined, '400', 800],
    ]);
    expect(inputs[2]!.county).toBe('TR');
    for (const i of inputs) expect(PlotInputSchema.safeParse({ ...i, id: undefined }).success).toBe(true);
  });

  it('the farmer can leave rows out, and confirm an "ask"', () => {
    const asked = [{ kind: 'ask' as const, plotId: 'old-other', overlap: 0.8 }, ...matches.slice(1)];
    const inputs = paperPlotsToInputs(paper, [matches[1]!, ...asked.slice(0, 1), matches[2]!, matches[3]!], {
      county: 'TR',
      sameAsAsked: new Set([1]),
      skip: new Set([0]),
    });
    expect(inputs.map((i) => i.id ?? i.blocFizic)).toEqual(['old-other', '400']);
  });
});

describe('placing paper parcels on the map', () => {
  const geometry = { type: 'Polygon' as const, coordinates: [[[25, 44], [25.01, 44], [25.01, 44.01], [25, 44], [25, 44]]] as [number, number][][] };
  const paper = readPaperPlots([row(), row({ bloc_fizic: '293', parcel_no: '2a' }), row({ bloc_fizic: '400', parcel_no: '3' })], data);
  const matches = [{ kind: 'same' as const, plotId: 'drawn' }, { kind: 'same' as const, plotId: 'unplaced' }, { kind: 'new' as const }];
  const placements = {
    0: { source: 'lpis' as const, geometry, centre: null, fit: 'whole' as const, bloc: null },
    1: { source: 'lpis' as const, geometry, centre: null, fit: 'whole' as const, bloc: null },
    2: { source: 'approx' as const, geometry: null, centre: [24.9, 44.1] as [number, number], fit: 'in_commune' as const, bloc: null },
  };

  it('a new or unplaced parcel takes the bloc or the rough place; a placed one keeps its own', () => {
    const inputs = paperPlotsToInputs(paper, matches, { county: 'TR', placements, placed: new Set(['drawn']) });
    expect(inputs.map((i) => [i.id, i.geometrySource, !!i.geometry, i.centre ?? null])).toEqual([
      ['drawn', undefined, false, null],
      ['unplaced', 'lpis', true, null],
      [undefined, 'approx', false, [24.9, 44.1]],
    ]);
  });
});
