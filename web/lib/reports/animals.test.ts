/* The APIA papers of phase 3 (docs/rapoarte-apia-plan.md): the animal declaration, the diesel Anexa 3, the hay
   proof, the PD-07 / PD-27 decont and the 2027 active-farmer proof, on Ion's farm with a herd added. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import { periodOf, type Livestock } from '../../../packages/shared/src/reports/index';
import { ionPlots } from '../cc/farm-plots';
import { viewFor } from '../cc/plan';
import { memoryStore } from '../cc/storage';
import { createStore, type LiveCalls } from '../cc/store';
import { farmFilings } from './apia-filings';
import { makeReport } from './inputs';
import type { Section } from './model';
import { reportPdf } from './pdf';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
const HARVEST = periodOf('harvest', '2027');
const ION = [
  { cropId: 'grau', areaHa: 8 },
  { cropId: 'porumb', areaHa: 7 },
];
const HERD: Livestock = { counts: { bovine_over_2y: 10, bovine_under_6m: 5, sheep: 40 }, ansvsaCode: 'RO1234567890', dairyCows: 6 };

async function ionWith(records: unknown[], livestock?: Livestock) {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const harvest = { id: 'r2027', year: 2027, status: 'open', openingBani: 3500000, summary: '15 ha', parcels: ION, records };
  const saved: Record<string, string> = { 'cropcash-demo-harvests': JSON.stringify({ selected: 'r2027', crop: null, items: [harvest] }) };
  if (livestock) saved['cropcash-demo-livestock'] = JSON.stringify(livestock);
  const store = createStore({
    mode: 'demo',
    store: memoryStore(saved),
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => true, fetchFn: (async () => ({ ok: true })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  await store.start();
  const farm = store.getState().farm!;
  return { store, farm, view: viewFor(farm, 'farm') };
}

const table = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'table' }> => s.kind === 'table' && s.title.startsWith(title));
const value = (sections: Section[], label: string) =>
  sections.flatMap((s) => (s.kind === 'facts' ? s.rows : [])).find((r) => r.label.startsWith(label))?.value;
/** Ion's first parcel turned into permanent grassland. */
const withGrassland = (): FarmPlots => {
  const p = ionPlots(ION, 2027);
  return { ...p, plots: p.plots.map((x, i) => (i === 0 ? { ...x, land_use: 'PP' } : x)) };
};

describe('the animal declaration (field 47)', () => {
  it('lists the heads per category with their UVM and the ANSVSA code', async () => {
    const { farm, view } = await ionWith([], HERD);
    const m = makeReport('apia-livestock', HARVEST, farm, view, NOW.getTime());
    expect(value(m.sections, 'Codul exploatației')).toBe('RO1234567890');
    expect(value(m.sections, 'În UVM')).toBe('18');
    const rows = table(m.sections, 'Câmpul 47')!.rows;
    expect(rows.find((r) => r.cells[0] === 'Ovine')!.cells.slice(1)).toEqual(['40', '6']);
    expect(rows.at(-1)!.cells).toEqual(['Total', '55', '18']);
    expect(m.missing!.map((x) => x.text)).toEqual([expect.stringContaining('crotalii')]);
  });

  it('asks for the animals and the code when nothing is noted', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-livestock', HARVEST, farm, view, NOW.getTime());
    expect(m.missing!.map((x) => x.text)).toEqual([expect.stringContaining('Nicio vită'), expect.stringContaining('ANSVSA')]);
  });
});

describe('the diesel Anexa 3', () => {
  it('adds the animals’ litres to the acord, by norm group', async () => {
    const { farm, view } = await ionWith([], HERD);
    const m = makeReport('apia-fuel-prior', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027));
    const rows = table(m.sections, 'Anexa 3')!.rows;
    expect(rows.map((r) => r.cells[0])).toEqual(['Bovine', 'Ovine și caprine', 'Total']);
    expect(rows[0].cells[1]).toBe('12');
    const none = await ionWith([]);
    expect(table(makeReport('apia-fuel-prior', HARVEST, none.farm, none.view, NOW.getTime(), ionPlots(ION, 2027)).sections, 'Anexa 3')).toBeUndefined();
  });
});

describe('the hay proof (Anexa 26)', () => {
  it('needs no proof with enough animals on the grassland', async () => {
    const { farm, view } = await ionWith([], HERD);
    const m = makeReport('apia-hay', HARVEST, farm, view, NOW.getTime(), withGrassland());
    expect(value(m.sections, 'Pajiște')).toBe('8 ha');
    expect(value(m.sections, 'Ai nevoie')).toMatch(/^nu: ai cel puțin 0,3 UVM\/ha/);
    expect(m.missing).toEqual([]);
  });

  it('asks for the hay and its papers under 0,3 UVM/ha, and prints the hay noted', async () => {
    const { farm, view } = await ionWith([], { counts: { sheep: 10 }, hay: { year: 2027, tenthsTonnes: 125 } });
    const m = makeReport('apia-hay', HARVEST, farm, view, NOW.getTime(), withGrassland());
    expect(value(m.sections, 'Ai nevoie')).toMatch(/^da/);
    expect(value(m.sections, 'Fân strâns')).toBe('12,5 t');
    expect(m.missing!.map((x) => x.text)).toEqual([expect.stringContaining('depozitare sau de vânzare')]);
    expect(m.signature).toBe(true);
  });
});

describe('the PD-07 and PD-27 decont', () => {
  it('leaves a row per dairy cow and per grassland parcel to fill by hand', async () => {
    const { farm, view } = await ionWith([], HERD);
    const m = makeReport('apia-animal-decont', HARVEST, farm, view, NOW.getTime(), withGrassland());
    expect(table(m.sections, 'Anexa 16¹')!.rows).toHaveLength(6);
    expect(table(m.sections, 'Anexa 19¹')!.rows).toHaveLength(1);
    expect(m.missing!.map((x) => x.text)).toEqual([expect.stringContaining('Crotaliile celor 6'), expect.stringContaining('pășunat'), expect.stringContaining('Facturile')]);
  });
});

describe('the 2027 active-farmer proof', () => {
  it('lists the arable parcels with their sowing, and the input invoices', async () => {
    const seed = { id: 'e1', date: '2026-10-01', kind: 'expense', category: 'seeds', cropId: 'grau', amountBani: -400000, docNo: 'S 1', counterparty: 'Agro SRL' };
    const fert = { id: 'e2', date: '2026-10-05', kind: 'expense', category: 'fertilizer', amountBani: -250000 };
    const { farm, view } = await ionWith([seed, fert, { id: 'e3', date: '2026-10-06', kind: 'expense', category: 'diesel', amountBani: -100000 }]);
    const m = makeReport('apia-active-farmer', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027));
    expect(table(m.sections, 'Parcelele')!.rows).toHaveLength(2);
    expect(table(m.sections, 'Facturile')!.rows.map((r) => r.cells[4])).toEqual(['S 1', '']);
    expect(value(m.sections, 'Depui până pe')).toBe('31 aug. 2027 (de verificat)');
    expect(m.missing!.map((x) => x.text)).toEqual(['O parcelă fără data semănatului.', 'Factura de sămânță pentru porumb.', 'Numărul facturii la o cheltuială.']);
  });
});

describe('the animals on the farm', () => {
  it('move the animal papers out of the maybes once noted', async () => {
    const { store, view } = await ionWith([]);
    const sections = () => new Map(farmFilings(store.getState().farm!, view, ionPlots(ION, 2027), 2027).map((x) => [x.paper.id, x.section]));
    expect(sections().get('cerere-zootehnie')).toBe('maybe');
    await store.setLivestock(HERD);
    expect(store.getState().farm!.livestock).toEqual(HERD);
    expect(sections().get('cerere-zootehnie')).toBe('next');
    expect(sections().get('fermier-activ')).toBe('next');
    await store.setLivestock({ counts: {} });
    expect(sections().get('cerere-zootehnie')).toBe('not_applicable');
  });
});

describe('the PDFs', () => {
  it('prints each phase 3 paper', async () => {
    const font = (name: string) => fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url));
    const fonts = { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') };
    const { farm, view } = await ionWith([], HERD);
    for (const id of ['apia-livestock', 'apia-hay', 'apia-animal-decont', 'apia-active-farmer', 'apia-fuel-prior'] as const) {
      const blob = await reportPdf(makeReport(id, HARVEST, farm, view, NOW.getTime(), withGrassland()), fonts);
      expect(blob.size, id).toBeGreaterThan(1000);
    }
  }, 60_000);
});
