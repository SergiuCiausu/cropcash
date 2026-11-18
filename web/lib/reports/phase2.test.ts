/* The reports on diesel, treatments, land and crops, from the same farm the pages read. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { op, plot, season } from '../../../packages/shared/src/plots/fixtures';
import { periodOf } from '../../../packages/shared/src/reports/index';
import { ionPlots } from '../cc/farm-plots';
import { viewFor } from '../cc/plan';
import { memoryStore } from '../cc/storage';
import { createStore, type LiveCalls } from '../cc/store';
import { expenseLabel } from '../ui/categories';
import { ledgerReport, REPORTS } from './build';
import { litres } from './format';
import { makeReport } from './inputs';
import type { ReportContext, Section } from './model';
import { reportPdf } from './pdf';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');

async function ionWith(records: unknown[]) {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const harvest = { id: 'r2027', year: 2027, status: 'open', openingBani: 3500000, summary: '15 ha, grâu și porumb', parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], records };
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

const table = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'table' }> => s.kind === 'table' && s.title === title);
const facts = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'facts' }> => s.kind === 'facts' && s.title === title)!;

const ctx: ReportContext = {
  farmName: 'Ion',
  county: 'Teleorman',
  farmSummary: '15 ha, grâu și porumb',
  today: '2026-11-15',
  staleSince: null,
  example: false,
  cropName: (id) => ({ grau: 'Grâu', porumb: 'Porumb' })[id] ?? id,
  categoryName: expenseLabel,
};

describe('the diesel report', () => {
  it('counts the litres noted on diesel, at the rate from docs/data, and lists what lacks litres', async () => {
    const { farm, view } = await ionWith([
      { id: 'd1', date: '2026-11-04', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100000, docNo: 'PTR 123', counterparty: 'Benzinăria din sat' },
      { id: 'd2', date: '2026-11-05', kind: 'expense', category: 'diesel', amountBani: -9000 },
    ]);
    const m = makeReport('fuel-excise', periodOf('quarter', '2026-Q4'), farm, view, NOW.getTime());
    const sum = facts(m.sections, 'Pe scurt').rows;
    expect(sum[0].value).toBe('1.000 l');
    // 1.000 l × 2,213 lei
    expect(sum[2]).toMatchObject({ label: 'Acciză de primit înapoi (2,213 lei pe litru)', value: '2.213,00 lei' });
    expect(table(m.sections, 'Facturile și bonurile')!.rows[0].cells.slice(2, 4)).toEqual(['PTR 123', 'Benzinăria din sat']);
    expect(table(m.sections, 'De completat: motorină fără litri')!.rows).toHaveLength(1);
    expect(m.notes[0]).toContain('de verificat');
    expect(m.fileName).toBe('cropcash-motorina-2026-T4');
  });

  it('writes litres the way Romanians do', () => {
    expect(litres(12050)).toBe('120,5 l');
    expect(litres(12005)).toBe('120,05 l');
    expect(litres(123400)).toBe('1.234 l');
  });
});

describe('the ledger with documents', () => {
  it('adds a document column only once something was noted in it', () => {
    const q = periodOf('quarter', '2026-Q3');
    const plain = ledgerReport(ctx, [{ id: '1', date: '2026-07-02', kind: 'sale', amountBani: 100000, cropId: 'grau' }], q);
    expect(table(plain.sections, 'Înregistrări')!.columns.map((c) => c.label)).not.toContain('Document');
    const withDoc = ledgerReport(ctx, [{ id: '1', date: '2026-07-02', kind: 'sale', amountBani: 100000, cropId: 'grau', docNo: 'F 7', counterparty: 'Agro SRL' }], q);
    const t = table(withDoc.sections, 'Înregistrări')!;
    expect(t.columns[4].label).toBe('Document');
    expect(t.rows[0].cells[4]).toBe('F 7 · Agro SRL');
    expect(t.columns.reduce((s, c) => s + c.width, 0)).toBeCloseTo(1);
    for (const r of t.rows) expect(r.cells).toHaveLength(t.columns.length);
  });
});

describe('the land reports', () => {
  it('lists Ion’s parcels with their blocs and crops, and the hectares per crop', async () => {
    const { farm, view } = await ionWith([]);
    const plots = ionPlots([{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], 2027);
    const m = makeReport('land-summary', periodOf('harvest', '2027'), farm, view, NOW.getTime(), plots);
    expect(table(m.sections, 'Pe culturi')!.rows.at(-1)!.cells).toEqual(['Total', '15 ha']);
    expect(table(m.sections, 'Pe parcele')!.rows.length).toBe(plots.seasons.filter((s) => s.harvest_year === 2027).length);
  });

  it('falls back to the harvest’s hectares when nothing is on the map', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('land-summary', periodOf('harvest', '2027'), farm, view, NOW.getTime(), null);
    expect(table(m.sections, 'Pe parcele')).toBeUndefined();
    expect(table(m.sections, 'Pe culturi')!.rows.map((r) => r.cells[1])).toEqual(['8 ha', '7 ha', '15 ha']);
    expect(m.notes[0]).toContain('nu sunt încă puse pe hartă');
  });

  it('puts each treatment done in the register, with its parcel and crop', async () => {
    const { farm, view } = await ionWith([]);
    const plots = {
      plots: [plot('p1', { name: 'La drum', bloc_fizic: '286', parcel_no: '1a' })],
      seasons: [season('p1', 'grau', 800, { harvest_year: 2027 })],
      operations: [op('t1', 'p1', { harvest_year: 2027, kind: 'herbicide', status: 'done', on_date: '2027-04-10', product: 'Produs X', dose: '1 l/ha' })],
    };
    const m = makeReport('phyto-register', periodOf('harvest', '2027'), farm, view, NOW.getTime(), plots);
    expect(table(m.sections, 'Tratamente făcute')!.rows[0].cells).toEqual(['1', '10.04.2027', 'La drum', view.cropName('grau'), 'Erbicid', 'Produs X', '1 l/ha', '8 ha']);
  });
});

describe('what was left on each crop', () => {
  it('matches “Plan și realitate” on each crop’s page', async () => {
    const { farm, view } = await ionWith([
      { id: 's', date: '2026-11-10', kind: 'sale', amountBani: 2500000, cropId: 'porumb' },
      { id: 'e', date: '2026-11-03', kind: 'expense', amountBani: -123400, category: 'seeds', cropId: 'grau' },
    ]);
    const h = farm.harvests!.items[0];
    const m = makeReport('crop-margins', periodOf('harvest', '2027'), farm, view, NOW.getTime());
    const rows = table(m.sections, 'Pe culturi')!.rows;
    const porumb = view.compare(h, 'porumb').rows;
    expect(rows[1].cells.slice(0, 4)).toEqual(['Porumb', '7 ha', `${(porumb[0].real / 100).toLocaleString('ro-RO').replace(/\s/g, '.')} lei`, expect.any(String)]);
    expect(rows.at(-1)!.cells[0]).toBe('Toată ferma');
    expect(m.notes.some((n) => n.includes('în lucru'))).toBe(true);
  });
});

describe('the catalogue', () => {
  it('gives institutions the land and treatment reports', () => {
    expect(REPORTS.filter((r) => r.audiences.includes('institution')).map((r) => r.id)).toEqual(['phyto-register', 'land-summary']);
  });

  it('prints each new report as a PDF', async () => {
    const font = (name: string) => fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url));
    const fonts = { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') };
    const { farm, view } = await ionWith([{ id: 'd1', date: '2026-11-04', kind: 'expense', category: 'diesel', amountBani: -700000, fuelLitersCl: 100050 }]);
    const plots = ionPlots([{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7 }], 2027);
    for (const [id, p] of [
      ['fuel-excise', periodOf('quarter', '2026-Q4')],
      ['phyto-register', periodOf('harvest', '2027')],
      ['land-summary', periodOf('harvest', '2027')],
      ['crop-margins', periodOf('harvest', '2027')],
    ] as const) {
      const blob = await reportPdf(makeReport(id, p, farm, view, NOW.getTime(), plots), fonts);
      expect(blob.size).toBeGreaterThan(1000);
    }
  }, 60_000);
});
