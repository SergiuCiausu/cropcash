/* The APIA papers of phase 2 (docs/rapoarte-apia-plan.md): the coupled-support proofs, the PD-04
   notebook, the fertilizing register, the notice and the checklist, on Ion's farm. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import { periodOf, type ApiaAnswers } from '../../../packages/shared/src/reports/index';
import { ionPlots } from '../cc/farm-plots';
import { viewFor } from '../cc/plan';
import { memoryStore } from '../cc/storage';
import { createStore, type LiveCalls } from '../cc/store';
import { farmFilings } from './apia-filings';
import { coupledCandidates, makeReport } from './inputs';
import type { Section } from './model';
import { reportPdf } from './pdf';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
const HARVEST = periodOf('harvest', '2027');
const SOY = data.catalogue.find((c) => c.code === 203)!.id;
const ION = [
  { cropId: 'grau', areaHa: 8 },
  { cropId: 'porumb', areaHa: 7 },
];
const WITH_SOY = [
  { cropId: 'grau', areaHa: 10 },
  { cropId: SOY, areaHa: 5 },
];

async function ionWith(records: unknown[], parcels = ION, extra: { gathered?: unknown[]; answers?: ApiaAnswers } = {}) {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const harvest = { id: 'r2027', year: 2027, status: 'open', openingBani: 3500000, summary: '15 ha', parcels, records };
  const saved: Record<string, string> = { 'cropcash-demo-harvests': JSON.stringify({ selected: 'r2027', crop: null, items: [harvest], gathered: extra.gathered ?? [] }) };
  if (extra.answers) saved['cropcash-demo-apia-facts'] = JSON.stringify(extra.answers);
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

const table = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'table' }> => s.kind === 'table' && s.title.startsWith(title))!;
const factsOf = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'facts' }> => s.kind === 'facts' && s.title.startsWith(title))!;
const value = (sections: Section[], title: string, label: string) => factsOf(sections, title).rows.find((r) => r.label.startsWith(label))!.value;

describe('the coupled-support proofs', () => {
  const sale = { id: 's1', date: '2026-10-02', kind: 'sale', cropId: SOY, amountBani: 1600000, docNo: 'F 12', counterparty: 'Cerealcom' };
  const seed = { id: 'e1', date: '2026-04-02', kind: 'expense', category: 'seeds', cropId: SOY, amountBani: -300000, docNo: 'S 3' };

  it('sums what was harvested and sold per hectare, against APIA’s minimum', async () => {
    const gathered = [{ cropId: SOY, areaHa: 5, tonnes: 10, priceLeiPerKg: null, storedTonnes: 2 }];
    const { farm, view } = await ionWith([sale, seed], WITH_SOY, { gathered });
    const m = makeReport('apia-coupled', HARVEST, farm, view, NOW.getTime(), ionPlots(WITH_SOY, 2027));
    expect(factsOf(m.sections, 'Soia').title).toBe('Soia (PD-09)');
    expect(value(m.sections, 'Soia', 'Suprafața')).toBe('5 ha');
    expect(value(m.sections, 'Soia', 'Vândut')).toBe('8.000 kg (1.600 kg/ha)');
    expect(value(m.sections, 'Soia', 'Ce cere')).toBe('cel puțin 1.500 kg/ha');
    expect(table(m.sections, 'Soia: vânzările').rows[0].cells).toEqual(['02.10.2026', 'Cerealcom', 'F 12', '16.000,00']);
    expect(table(m.sections, 'Soia: sămânța').rows).toHaveLength(1);
    expect(m.missing).toEqual([]);
    expect(m.signature).toBe(true);
  });

  it('says what is missing: the harvest, the seed invoice and the sales', async () => {
    const { farm, view } = await ionWith([], WITH_SOY);
    const m = makeReport('apia-coupled', HARVEST, farm, view, NOW.getTime(), ionPlots(WITH_SOY, 2027));
    expect(m.missing!.map((x) => x.text)).toEqual([
      'Soia: cât ai recoltat. Notează recolta în Recolte.',
      'Soia: factura de sămânță certificată.',
      'Soia: facturile sau bonurile pentru ce ai vândut (sau nota de recepție, dacă ai folosit-o la animale).',
    ]);
  });

  it('flags a yield under the minimum', async () => {
    const gathered = [{ cropId: SOY, areaHa: 5, tonnes: 5, priceLeiPerKg: null, storedTonnes: 0 }];
    const { farm, view } = await ionWith([sale, seed], WITH_SOY, { gathered });
    const m = makeReport('apia-coupled', HARVEST, farm, view, NOW.getTime(), ionPlots(WITH_SOY, 2027));
    expect(m.missing!.map((x) => x.text)).toEqual(['Soia: ai vândut sau folosit 1.000 kg/ha, APIA cere cel puțin 1.500 kg/ha.']);
  });

  it('leaves out a crop the farmer said they didn’t ask coupled support for', async () => {
    const { farm, view } = await ionWith([], WITH_SOY, { answers: { coupledCrops: [] } });
    const m = makeReport('apia-coupled', HARVEST, farm, view, NOW.getTime(), ionPlots(WITH_SOY, 2027));
    expect(m.sections).toHaveLength(1);
    expect(value(m.sections, 'Pe scurt', 'Culturi')).toBe('niciuna');
  });

  it('offers only the farm’s crops that have coupled support', async () => {
    const { farm, view } = await ionWith([], WITH_SOY);
    expect(coupledCandidates(farm, view, ionPlots(WITH_SOY, 2027), 2027).map((c) => c.cropId)).toEqual([SOY]);
    const ion = await ionWith([]);
    expect(coupledCandidates(ion.farm, ion.view, ionPlots(ION, 2027), 2027)).toEqual([]);
  });
});

describe('the PD-04 eco-scheme notebook', () => {
  it('counts Ion’s distinct crops and lists his parcels with the work noted', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-eco-pd04', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027));
    expect(value(m.sections, 'Pe scurt', 'Teren arabil')).toBe('15 ha');
    expect(value(m.sections, 'Pe scurt', 'Culturi diferite')).toBe('2');
    expect(table(m.sections, 'Diversificarea').rows.map((r) => r.cells[2])).toEqual(['53%', '47%']);
    const grau = table(m.sections, 'Pe parcele').rows.find((r) => r.cells[1].toLowerCase().includes('grâu'))!;
    expect(grau.cells[3]).not.toBe('');
    expect(grau.cells[4]).toBe('28.09.2026');
    /* Corn isn't sown yet in Ion's demo. */
    expect(m.missing!.map((x) => x.text)).toEqual(['O parcelă fără data semănatului.']);
  });

  it('says when one crop is not enough', async () => {
    const one = [{ cropId: 'grau', areaHa: 15 }];
    const { farm, view } = await ionWith([], one);
    const m = makeReport('apia-eco-pd04', HARVEST, farm, view, NOW.getTime(), ionPlots(one, 2027));
    expect(m.missing!.map((x) => x.text)).toContain('Ai o singură cultură; eco-schema cere cel puțin 2.');
  });
});

describe('the fertilizing plan and register', () => {
  it('gives each crop its confirmed nitrogen limit and lists the fertilizing done', async () => {
    const { farm, view } = await ionWith([]);
    const plots = ionPlots(ION, 2027);
    const done: FarmPlots = { ...plots, operations: [...plots.operations, { ...plots.operations[0], id: 'f1', kind: 'fertilizing', status: 'done', on_date: '2026-10-08', product: 'Azotat de amoniu', dose: '150 kg/ha' }] };
    const m = makeReport('fertilizer-register', HARVEST, farm, view, NOW.getTime(), done);
    const plan = table(m.sections, 'Planul').rows;
    expect(plan.map((r) => r.cells.slice(2))).toEqual([
      ['120', '960 kg'],
      ['150', '1.050 kg'],
    ]);
    const rows = table(m.sections, 'Registrul').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.slice(1, 2).concat(rows[0].cells.slice(4, 6))).toEqual(['08.10.2026', 'Azotat de amoniu', '150 kg/ha']);
    expect(m.missing).toEqual([]);
  });

  it('leaves out the planned fertilizing and says what a done one lacks', async () => {
    const { farm, view } = await ionWith([]);
    const plots = ionPlots(ION, 2027);
    expect(table(makeReport('fertilizer-register', HARVEST, farm, view, NOW.getTime(), plots).sections, 'Registrul').rows).toEqual([]);
    const bare: FarmPlots = { ...plots, operations: [{ ...plots.operations[0], id: 'f2', kind: 'fertilizing', status: 'done', product: null, dose: null }] };
    expect(makeReport('fertilizer-register', HARVEST, farm, view, NOW.getTime(), bare).missing!.map((x) => x.text)).toEqual(['O fertilizare fără produs.', 'O fertilizare fără doză.']);
  });
});

describe('the notice to APIA', () => {
  it('prints what the farmer wrote and the parcels, with the blanks to fill by hand', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-notice', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027), { text: 'Grindina din 12 iunie' });
    expect(factsOf(m.sections, 'Ce s-a întâmplat').rows[0].label).toBe('Grindina din 12 iunie');
    expect(table(m.sections, 'Parcelele').rows).toHaveLength(2);
    expect(m.missing).toHaveLength(2);
    const empty = makeReport('apia-notice', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027));
    expect(empty.missing).toHaveLength(3);
  });
});

describe('the checklist', () => {
  it('lists the papers due next and the maybes, each with its documents', async () => {
    const { farm, view } = await ionWith([]);
    const m = makeReport('apia-checklist', HARVEST, farm, view, NOW.getTime(), ionPlots(ION, 2027));
    const titles = m.sections.map((s) => s.title);
    expect(titles.some((t) => t.startsWith('Fișa pentru declarația de suprafață'))).toBe(true);
    expect(titles.some((t) => t.endsWith('(dacă ți se aplică)'))).toBe(true);
    const first = m.sections[0] as Extract<Section, { kind: 'table' }>;
    expect(first.rows.every((r) => r.cells[0] === '' && r.cells[1].length > 0)).toBe(true);
  });
});

describe('the farmer’s answers', () => {
  it('move a paper out of the maybes on Ion’s farm, and back when asked again', async () => {
    const { store, view } = await ionWith([]);
    const sections = () => new Map(farmFilings(store.getState().farm!, view, ionPlots(ION, 2027), 2027).map((x) => [x.paper.id, x.section]));
    expect(sections().get('cerere-zootehnie')).toBe('maybe');
    await store.setApiaAnswers({ animals: false, fuel: true });
    expect(store.getState().farm!.apiaAnswers).toEqual({ animals: false, fuel: true });
    expect(sections().get('cerere-zootehnie')).toBe('not_applicable');
    expect(sections().get('motorina-trimestru')).toBe('next');
    await store.setApiaAnswers({});
    expect(sections().get('cerere-zootehnie')).toBe('maybe');
  });
});

describe('the PDFs', () => {
  it('prints each phase 2 paper', async () => {
    const font = (name: string) => fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url));
    const fonts = { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') };
    const { farm, view } = await ionWith([], WITH_SOY);
    const plots = ionPlots(WITH_SOY, 2027);
    for (const id of ['apia-coupled', 'apia-eco-pd04', 'fertilizer-register', 'apia-notice', 'apia-checklist'] as const) {
      const blob = await reportPdf(makeReport(id, HARVEST, farm, view, NOW.getTime(), plots, { text: 'Grindină' }), fonts);
      expect(blob.size, id).toBeGreaterThan(1000);
    }
  }, 60_000);
});
