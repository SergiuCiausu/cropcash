/* The crop tabs and "Pe culturi": each crop's figures and the farm's total must add up. */
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { cropTabs, type Harvest } from './harvests';
import { viewFor } from './plan';
import { memoryStore } from './storage';
import { createStore, type LiveCalls } from './store';
import type { Mode } from './storage';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');

async function viewOf(saved: Record<string, string> = {}, mode: Mode = 'demo') {
  const live: LiveCalls = { api: vi.fn(async () => ({}) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const store = createStore({
    mode,
    store: memoryStore(saved),
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => true, fetchFn: (async () => ({ ok: true })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  await store.start();
  return store.getState().farm!;
}

const ion = { id: 'r2027', year: 2027, status: 'open' as const, openingBani: 0, summary: '', parcels: [{ cropId: 'grau', areaHa: 8 }, { cropId: 'porumb', areaHa: 7.5 }] };
const harvests = (records: unknown[], crop: string | null = null) => ({ 'cropcash-demo-harvests': JSON.stringify({ selected: 'r2027', crop, items: [{ ...ion, records }] }) });

describe('cropTabs', () => {
  const name = (id: string) => ({ grau: 'Grâu', porumb: 'Porumb' })[id] ?? '';

  it('puts the whole farm first, then each crop with its hectares', () => {
    expect(cropTabs(ion as unknown as Harvest, null, name)).toEqual([
      { cropId: null, label: 'Toată ferma', sub: null, current: true },
      { cropId: 'grau', label: 'Grâu', sub: '8 ha', current: false },
      { cropId: 'porumb', label: 'Porumb', sub: '7,5 ha', current: false },
    ]);
  });

  it('says when a crop is finished', () => {
    const h = { ...ion, parcels: [{ cropId: 'grau', areaHa: 8, status: 'closed' as const }, ion.parcels[1]] };
    const [, grau] = cropTabs(h as unknown as Harvest, 'grau', name);
    expect(grau).toMatchObject({ sub: 'încheiată', current: true });
  });
});

describe('cropBreakdown', () => {
  const addsUp = (b: ReturnType<ReturnType<typeof viewFor>['cropBreakdown']>) => {
    expect(b.rows.reduce((s, r) => s + r.inBani, 0) + b.shared.inBani).toBe(b.total.inBani);
    expect(b.rows.reduce((s, r) => s + r.outBani, 0) + b.shared.outBani).toBe(b.total.outBani);
    for (const r of b.rows) expect(Number.isInteger(r.inBani) && Number.isInteger(r.outBani)).toBe(true);
  };

  it.each(['bad', 'medium', 'good'] as const)('splits a %s year with nothing left over', async (year) => {
    const b = viewFor(await viewOf(harvests([])), 'picked').cropBreakdown(year);
    addsUp(b);
    expect(b.rows.map((r) => r.cropId)).toEqual(['grau', 'porumb']);
    expect(b.shared).toEqual({ inBani: 0, outBani: 0 });
  });

  it('is the same on Acasă and on the pages that follow the picker', async () => {
    const farm = await viewOf(harvests([]));
    expect(viewFor(farm, 'farm').cropBreakdown()).toEqual(viewFor(farm, 'picked').cropBreakdown());
  });

  it('matches what a crop tab shows', async () => {
    const farm = await viewOf(harvests([], 'porumb'));
    const view = viewFor(farm, 'picked');
    const months = view.crop!.months(view.farmPlan().timelines.medium);
    const row = view.cropBreakdown().rows.find((r) => r.cropId === 'porumb')!;
    expect(row.inBani).toBe(months.reduce((s, m) => s + m.in, 0));
    expect(row.outBani).toBe(months.reduce((s, m) => s + m.out, 0));
  });

  it('keeps a cost with no crop in its own row, and still adds up', async () => {
    const b = viewFor(await viewOf(harvests([{ id: 'n1', kind: 'expense', category: 'repairs', amountBani: -50_000, date: '2026-11-10' }])), 'picked').cropBreakdown();
    addsUp(b);
  });

  it('gives Acasă the picked crop, and the whole farm when this harvest has no such crop', async () => {
    expect(viewFor(await viewOf(harvests([], 'porumb')), 'farm').tabbedCrop?.id).toBe('porumb');
    expect(viewFor(await viewOf(harvests([], 'soia')), 'farm').tabbedCrop).toBeNull();
  });
});
