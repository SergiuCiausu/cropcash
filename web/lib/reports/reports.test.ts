/* Reports say what the pages say, in words a farmer and an accountant read, and come out as a real PDF
   with Romanian letters. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { periodOf } from '../../../packages/shared/src/reports/index';
import { viewFor } from '../cc/plan';
import { memoryStore } from '../cc/storage';
import { createStore, type LiveCalls } from '../cc/store';
import { expenseLabel } from '../ui/categories';
import { ledgerReport, periodLabel, REPORTS } from './build';
import { makeReport, periodChoices, staleSince } from './inputs';
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

const RECORDS = [
  { id: 'a', date: '2026-11-03', kind: 'expense', amountBani: -123456, category: 'seeds', cropId: 'grau' },
  { id: 'b', date: '2026-11-10', kind: 'sale', amountBani: 2500000, cropId: 'porumb' },
  { id: 'c', date: '2026-11-12', kind: 'apia_advance', amountBani: 1800000, fixed: true },
];

const table = (sections: Section[], title: string) => sections.find((s): s is Extract<Section, { kind: 'table' }> => s.kind === 'table' && s.title === title)!;
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

describe('the ledger for the accountant', () => {
  const rows = [
    { id: '1', date: '2026-07-02', kind: 'sale' as const, amountBani: 100000, cropId: 'grau' },
    { id: '2', date: '2026-08-15', kind: 'expense' as const, amountBani: -4550, category: 'diesel' },
    { id: '3', date: '2026-08-20', kind: 'expense' as const, amountBani: -1000 },
  ];
  const m = ledgerReport(ctx, rows, periodOf('quarter', '2026-Q3'));

  it('lists every record to the ban, with a subtotal per month and a total', () => {
    const entries = table(m.sections, 'Înregistrări').rows;
    expect(entries.map((r) => [r.tone ?? '', ...r.cells])).toEqual([
      ['', '1', '02.07.2026', 'Vânzare', 'grâu', '1.000,00', ''],
      ['subtotal', '', '', '', 'Total iulie 2026', '1.000,00', ''],
      ['', '2', '15.08.2026', 'Cheltuială', 'Motorină', '', '45,50'],
      ['', '3', '20.08.2026', 'Cheltuială', 'fără categorie', '', '10,00'],
      ['subtotal', '', '', '', 'Total august 2026', '', '55,50'],
      ['total', '', '', '', 'Total perioadă', '1.000,00', '55,50'],
    ]);
    expect(facts(m.sections, 'Totaluri').rows.find((r) => r.label === 'Diferența')!.value).toBe('944,50 lei');
  });

  it('names the file after the report and the quarter', () => {
    expect(m.fileName).toBe('cropcash-registru-2026-T3');
    expect(m.subtitle).toBe('Ion · Trimestrul 3 din 2026 (iul.–sept.)');
  });

  it('says so when there is nothing in the period', () => {
    const empty = ledgerReport(ctx, [], periodOf('month', '2026-02'));
    expect(table(empty.sections, 'Înregistrări').rows).toEqual([]);
    expect(table(empty.sections, 'Înregistrări').empty).toMatch(/Nicio/);
  });
});

describe('reports from the farm the pages read', () => {
  it('match the money on the pages, on Ion’s farm', async () => {
    const { farm, view } = await ionWith(RECORDS);
    const m = makeReport('ledger', periodOf('harvest', '2027'), farm, view, NOW.getTime());
    const [inRow, outRow] = facts(m.sections, 'Totaluri').rows;
    expect(inRow.value).toBe('43.000,00 lei');
    expect(outRow.value).toBe('1.234,56 lei');
    expect(table(m.sections, 'Înregistrări').rows[2].cells[3]).toBe('avans (prin cont)');
    expect(m.watermark).toBe('EXEMPLU');
  });

  it('gives the farmer the salary and “Plan și realitate” exactly as the pages do', async () => {
    const { farm, view } = await ionWith(RECORDS);
    const m = makeReport('farm-summary', periodOf('harvest', '2027'), farm, view, NOW.getTime());
    const h = farm.harvests!.items[0];
    expect(table(m.sections, 'Plan și realitate').rows.map((r) => r.cells[0])).toEqual(view.compare(h).rows.map((r) => r.label));
    const salary = facts(m.sections, 'Pe scurt').rows[0];
    expect(salary.label).toBe('Salariul tău pe lună');
    expect(salary.value).toBe(`${String(Math.round(view.farmPlan().monthlySalary / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} lei`);
    for (const row of table(m.sections, 'Ce urmează').rows) expect(row.cells[1]).not.toBe('');
  });

  it('lists APIA money received and what the plan still expects', async () => {
    const { farm, view } = await ionWith(RECORDS);
    const m = makeReport('subsidies', periodOf('harvest', '2027'), farm, view, NOW.getTime());
    expect(table(m.sections, 'Primite').rows).toHaveLength(1);
    const expected = view
      .farmPlan()
      .timelines.medium.months.flatMap((x) => x.entries)
      .filter((e) => (e.kind === 'apia_advance' || e.kind === 'apia_balance') && e.date >= '2026-11-15' && e.date <= '2027-10-31');
    expect(table(m.sections, 'Ce mai urmează').rows).toHaveLength(expected.length);
  });

  it('offers the farm’s own harvests, and periods counting back from today', async () => {
    const { farm } = await ionWith([]);
    expect(periodChoices('harvest', farm).map((p) => p.key)).toEqual(['2027']);
    expect(periodChoices('quarter', farm)[0].key).toBe('2026-Q4');
    expect(periodChoices('month', farm)).toHaveLength(12);
  });
});

describe('words', () => {
  it('names each period', () => {
    expect(periodLabel(periodOf('month', '2026-03'))).toBe('martie 2026');
    expect(periodLabel(periodOf('harvest', '2027'))).toBe('Recolta 2027 (nov. 2026 – oct. 2027)');
    expect(periodLabel(periodOf('year', '2026'))).toBe('anul 2026');
  });

  it('warns about a copy a week old, not a fresh one', () => {
    expect(staleSince('2026-11-01T08:00:00Z', NOW.getTime())).toBe('2026-11-01');
    expect(staleSince('2026-11-14T08:00:00Z', NOW.getTime())).toBeNull();
    expect(staleSince(null, NOW.getTime())).toBeNull();
  });

  it('gives every report at least one period and one reader', () => {
    for (const r of REPORTS) {
      expect(r.periods.length).toBeGreaterThan(0);
      expect(r.audiences.length).toBeGreaterThan(0);
    }
  });
});

describe('the PDF', () => {
  const font = (name: string) => fileURLToPath(new URL(`../../public/fonts/${name}`, import.meta.url));

  it('is a PDF with Geist embedded, so ș and ț print', async () => {
    const m = ledgerReport({ ...ctx, example: true }, [{ id: '1', date: '2026-07-02', kind: 'expense', amountBani: -100, category: 'treatments' }], periodOf('quarter', '2026-Q3'));
    const blob = await reportPdf(m, { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') });
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.includes(Buffer.from('Geist'))).toBe(true);
  }, 30_000);

  it('makes one PDF after another, each with its own copy of the font', async () => {
    const fonts = { regular: font('Geist-Regular.ttf'), semibold: font('Geist-SemiBold.ttf') };
    const one = ledgerReport(ctx, [], periodOf('month', '2026-02'));
    const two = ledgerReport({ ...ctx, farmName: 'Maria Ștefănescu' }, [], periodOf('year', '2025'));
    for (const m of [one, two, one]) expect((await reportPdf(m, fonts)).size).toBeGreaterThan(1000);
  }, 30_000);

  it('ships both weights with Romanian letters', () => {
    for (const f of ['Geist-Regular.ttf', 'Geist-SemiBold.ttf']) expect(readFileSync(font(f)).length).toBeGreaterThan(10_000);
  });
});
