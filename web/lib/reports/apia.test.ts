/* The APIA papers on /rapoarte (docs/rapoarte-apia-plan.md, phase 1): the surface sheet, the diesel
   Anexa 9 and Anexa 2, and which papers Ion's farm gets. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { plot, season } from '../../../packages/shared/src/plots/fixtures';
import { periodOf } from '../../../packages/shared/src/reports/index';
import { ionPlots } from '../cc/farm-plots';
import { viewFor } from '../cc/plan';
import { memoryStore } from '../cc/storage';
import { createStore, type LiveCalls } from '../cc/store';
import { APIA_PAPERS, farmFilings } from './apia-filings';
import { REPORTS } from './build';
import { makeReport } from './inputs';
import type { Section } from './model';
import { reportPdf } from './pdf';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
const ION = [
  { cropId: 'grau', areaHa: 8 },
  { cropId: 'porumb', areaHa: 7 },
];

async function ionWith(records: unknown[], parcels = ION) {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const harvest = { id: 'r2027', year: 2027, status: 'open', openingBani: 3500000, summary: '15 ha, grâu și porumb', parcels, records };
  const store = createStore({
    mode: 'demo',
    store: memoryStore({ 'cropcash-demo-harvests': JSON.stringify({ selected: 'r2027', crop: null, items: [harvest] }) }),
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => true, fetchFn: (async () => ({ ok: true })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  await store.start();
  const farm = store.getState().farm!;
  return { farm, view: viewFor(farm, 'farm') };
}

const table = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'table' }> => s.kind === 'table' && s.title.startsWith(title))!;
const facts = (sections: Section[]) => sections.find((s): s is Extract<Section, { kind: 'facts' }> => s.kind === 'facts')!;
const code = (cropId: string) => data.catalogue.find((c) => c.id === cropId)!.code;

describe('apia-papers.json and the reports', () => {
  it('names only reports that exist', () => {
    const ids = new Set(REPORTS.map((r) => r.id));
    for (const p of APIA_PAPERS.papers) if (p.report) expect(ids.has(p.report as never), p.id).toBe(true);
  });
});

describe('the surface declaration sheet', () => {
  it('lists Ion’s parcels from the map, with bloc, SIRUTA, land use and the APIA code', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-surface', periodOf('harvest', '2027'), farm, view, NOW.getTime(), ionPlots(ION, 2027));
    const rows = table(m.sections, 'Rândurile').rows;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.cells[2]).not.toBe(''); // bloc fizic
      expect(r.cells[4]).toBe('TA');
    }
    expect(rows.map((r) => r.cells[5]).sort()).toEqual([String(code('grau')), String(code('porumb'))].sort());
    expect(facts(m.sections).rows[0]).toMatchObject({ value: '15 ha', strong: true });
    /* Ion's parcels have blocs but no parcel numbers: that's the one gap. */
    expect(m.missing).toEqual([{ text: '2 parcele fără numărul parcelei.', screen: 'harta' }]);
    expect(m.subtitle).toContain('Campania APIA 2027');
  });

  it('keeps the code read off the cerere over the crop’s own', async () => {
    const { farm, view } = await ionWith([]);
    const plots = { plots: [plot('p1', { bloc_fizic: '286', parcel_no: '1a', land_use: 'TA', siruta: 152044 })], seasons: [season('p1', 'grau', 800, { harvest_year: 2027, apia_crop_code: 1010 })], operations: [] };
    const m = makeReport('apia-surface', periodOf('harvest', '2027'), farm, view, NOW.getTime(), plots);
    expect(table(m.sections, 'Rândurile').rows[0].cells.slice(2, 6)).toEqual(['286', '1a', 'TA', '1010']);
    expect(m.missing).toEqual([]);
  });

  it('falls back to the harvest’s crops when nothing is on the map, and says so', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-surface', periodOf('harvest', '2027'), farm, view, NOW.getTime(), { plots: [], seasons: [], operations: [] });
    expect(table(m.sections, 'Rândurile').rows.map((r) => r.cells[7])).toEqual(['8 ha', '7 ha']);
    expect(m.missing![0]).toMatchObject({ screen: 'harta', text: expect.stringContaining('nu sunt pe hartă') });
  });
});

describe('the diesel Anexa 9', () => {
  it('lists every diesel invoice in the quarter with supplier, number, date and litres, and what each lacks', async () => {
    const { farm, view } = await ionWith([
      { id: 'd1', date: '2026-10-04', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100000, docNo: 'PTR 123', counterparty: 'Petrom' },
      { id: 'd2', date: '2026-11-05', kind: 'expense', category: 'diesel', amountBani: -90000 },
      { id: 's1', date: '2026-11-06', kind: 'expense', category: 'seeds', amountBani: -50000 },
      { id: 'd0', date: '2026-09-30', kind: 'expense', category: 'diesel', amountBani: -10000, fuelLitersCl: 1000, docNo: 'X', counterparty: 'Y' },
    ]);
    const m = makeReport('apia-fuel-claim', periodOf('quarter', '2026-Q4'), farm, view, NOW.getTime());
    const t = table(m.sections, 'Situația centralizatoare');
    expect(t.rows.map((r) => r.cells)).toEqual([
      ['1', 'Petrom', 'PTR 123', '04.10.2026', '1.000 l', '1.000 l'],
      ['2', '', '', '05.11.2026', '', ''],
      ['', 'Total', '', '', '1.000 l', '1.000 l'],
    ]);
    expect(m.missing!.map((x) => x.text)).toEqual(['O factură fără furnizor.', 'O factură fără numărul facturii.', 'O factură fără litri.']);
    expect(m.signature).toBe(true);
    expect(facts(m.sections).rows.find((r) => r.label === 'Depui până pe')!.value).toContain('2027');
  });

  it('says there are no invoices in an empty quarter', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-fuel-claim', periodOf('quarter', '2026-Q4'), farm, view, NOW.getTime());
    expect(m.missing).toEqual([{ text: expect.stringContaining('Nicio factură'), screen: 'recolte' }]);
  });
});

describe('the diesel Anexa 2', () => {
  it('gives each crop its litres per hectare from fuel-excise.json and adds them up', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-fuel-prior', periodOf('harvest', '2027'), farm, view, NOW.getTime(), ionPlots(ION, 2027));
    const rows = table(m.sections, 'Situația suprafețelor').rows;
    /* Cereals: 78 l/ha (HG 1174/2014): 15 ha × 78 = 1.170 l. */
    expect(rows.map((r) => [r.cells[3], r.cells[4], r.cells[5]])).toEqual([
      ['8 ha', '78', '624 l'],
      ['7 ha', '78', '546 l'],
      ['15 ha', '', '1.170 l'],
    ]);
    expect(m.missing).toEqual([]);
    expect(m.notes.some((n) => n.includes('prelungește'))).toBe(true);
  });

  it('leaves out fallow land and names the crops with no norm', async () => {
    const { farm, view } = await ionWith([], [...ION, { cropId: 'teren-necultivat', areaHa: 1 }]);
    const m = makeReport('apia-fuel-prior', periodOf('harvest', '2027'), farm, view, NOW.getTime(), { plots: [], seasons: [], operations: [] });
    expect(table(m.sections, 'Situația suprafețelor').rows.at(-1)!.cells[3]).toBe('15 ha');
  });
});

describe('Ion’s papers', () => {
  it('puts the diesel papers among the maybes, and the cerere and the registers in their places', async () => {
    const { farm, view } = await ionWith([]);
    const f = new Map(farmFilings(farm, view, ionPlots(ION, 2027), 2027).map((x) => [x.paper.id, x.section]));
    expect(f.get('cerere-suprafata')).toBe('next');
    expect(f.get('registrul-agricol')).toBe('next');
    expect(f.get('registru-tratamente')).toBe('keep');
    expect(f.get('motorina-trimestru')).toBe('maybe');
    expect(f.get('pajisti-fan')).toBe('not_applicable');
    expect(f.get('geofoto')).toBe('not_applicable');
  });

  it('counts the diesel noted as using diesel', async () => {
    const { farm, view } = await ionWith([{ id: 'd1', date: '2026-11-04', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100000 }]);
    const f = new Map(farmFilings(farm, view, ionPlots(ION, 2027), 2027).map((x) => [x.paper.id, x.section]));
    expect(f.get('motorina-trimestru')).toBe('next');
    expect(f.get('motorina-acord')).toBe('next');
  });
});

describe('the PDFs', () => {
  it('prints each APIA paper, with what to fill in by hand and the signature', async () => {
    const font = (name: string) => fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url));
    const fonts = { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') };
    const { farm, view } = await ionWith([{ id: 'd1', date: '2026-11-04', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100050 }]);
    const plots = ionPlots(ION, 2027);
    for (const [id, p] of [
      ['apia-surface', periodOf('harvest', '2027')],
      ['apia-fuel-claim', periodOf('quarter', '2026-Q4')],
      ['apia-fuel-prior', periodOf('harvest', '2027')],
    ] as const) {
      const blob = await reportPdf(makeReport(id, p, farm, view, NOW.getTime(), plots), fonts);
      expect(blob.size).toBeGreaterThan(1000);
    }
  }, 60_000);
});
