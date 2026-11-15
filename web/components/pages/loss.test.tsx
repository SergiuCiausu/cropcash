// @vitest-environment happy-dom
/* Lost hectares on Recolte (docs/crop-loss-plan.md, step 5): typed in hectares with the % shown,
   saved on the harvest, and asked about when a harvest is closed. Empty is "didn't say", not 0. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lossEcho, lossLine, readLoss } from '../../lib/ui/loss';
import { ME, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click = async (el: Element) => act(async () => void fireEvent.click(el));
const sheet = () => document.querySelector('dialog[open]') as HTMLElement;
const WHEAT = 'Grâu comun de toamnă';
const writes = (live: { write: unknown }) => JSON.stringify((live.write as ReturnType<typeof vi.fn>).mock.calls);

describe('reading the field', () => {
  const t = (ha: string, reason: 'drought' | null = null) => ({ ha, reason });

  it('keeps "didn\'t say" apart from 0', () => {
    expect(readLoss(t(''), 8, 'Porumb')).toEqual({ kind: 'unknown' });
    expect(readLoss(t('0', 'drought'), 8, 'Porumb')).toEqual({ kind: 'ok', lost: { ha: 0 } });
  });

  it('takes a comma, the reason and the month', () => {
    expect(readLoss(t('2,5', 'drought'), 8, 'Porumb', '2027-06')).toEqual({ kind: 'ok', lost: { ha: 2.5, reason: 'drought', month: '2027-06' } });
  });

  it('refuses more than was sown, and anything that is not a number', () => {
    expect(readLoss(t('9'), 8, 'Porumb')).toMatchObject({ kind: 'error', text: 'Porumb: n-ai cum pierde mai mult de 8 ha, câte ai semănat.' });
    expect(readLoss(t('trei'), 8, 'Porumb').kind).toBe('error');
  });

  it('shows the share', () => {
    expect(lossEcho(t('3'), 8)).toBe('3 ha din 8, adică 38%.');
    expect(lossEcho(t('0'), 8)).toBe('Nimic pierdut.');
    expect(lossEcho(t(''), 8)).toBeNull();
  });
});

describe('Recolte', () => {
  it('notes a loss on a crop still in the ground, with the month it happened', async () => {
    const { live } = await showPage('recolte', 'farm', SIGNED_IN);
    await click(screen.getByRole('button', { name: 'Am pierdut o parte din cultură' }));
    const s = sheet();
    fireEvent.change(within(s).getByLabelText('Câte hectare ai pierdut?'), { target: { value: '2' } });
    expect(s.textContent).toContain('2 ha din 5, adică 40%.');
    await click(within(s).getByRole('button', { name: 'Secetă' }));
    await act(async () => void fireEvent.submit(s.querySelector('form')!));
    await vi.waitFor(() => expect(writes(live)).toMatch(/"lost":\{"ha":2,"reason":"drought","month":"\d{4}-\d{2}"\}/));
  });

  it('asks on the harvest sheet, and counts tonnes on the harvested hectares', async () => {
    await showPage('recolte', 'farm', SIGNED_IN);
    await click(screen.getByRole('button', { name: 'Notează recolta' }));
    const wheat = [...sheet().querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent === WHEAT)!;
    expect(within(wheat).getByLabelText('Câte tone ai strâns de pe hectarele recoltate?')).toBeTruthy();
    fireEvent.change(within(wheat).getByLabelText('Câte hectare n-ai putut strânge?'), { target: { value: '1' } });
    expect(wheat.textContent).toContain('1 ha din 5, adică 20%.');
  });

  it('refuses a loss larger than the crop and saves nothing', async () => {
    const { live } = await showPage('recolte', 'farm', SIGNED_IN);
    const before = writes(live);
    await click(screen.getByRole('button', { name: 'Am pierdut o parte din cultură' }));
    fireEvent.change(within(sheet()).getByLabelText('Câte hectare ai pierdut?'), { target: { value: '7' } });
    await act(async () => void fireEvent.submit(sheet().querySelector('form')!));
    expect(sheet().textContent).toContain('n-ai cum pierde mai mult de 5 ha');
    expect(writes(live)).toBe(before);
  });

  it('asks about every crop when the harvest is closed: „Nimic” saves 0, no answer stays unknown', async () => {
    const { live } = await showPage('recolte', 'farm', SIGNED_IN);
    await click(screen.getByRole('button', { name: 'Încheie recolta' }));
    const s = sheet();
    expect(within(s).getByRole('group', { name: `Ai pierdut ceva din ${WHEAT.toLowerCase()}?` })).toBeTruthy();
    await click(within(within(s).getByRole('group', { name: `Ai pierdut ceva din ${WHEAT.toLowerCase()}?` })).getByRole('button', { name: 'Nimic' }));
    await click(within(s).getByRole('button', { name: 'Încheie' }));
    await vi.waitFor(() => expect(writes(live)).toContain('"status":"closed"'));
    const calls = (live.write as ReturnType<typeof vi.fn>).mock.calls as [string, { years: { status?: string; parcels: { cropId: string; lost?: unknown }[] }[] }][];
    const closed = calls.filter(([name]) => name === "save_harvests").map(([, v]) => v.years.find((y) => y.status === "closed")).find(Boolean)!;
    expect(closed.parcels.find((p) => p.cropId === "grau")!.lost).toEqual({ ha: 0 });
    expect(closed.parcels.find((p) => p.cropId === "porumb")!.lost).toBeUndefined();
  });
});

/* Step 6: the history on Datele planului, the farmer's own %, and Prognoză saying what it subtracted. */
const year = (y: number, lostHa: number) => ({ year: y, status: 'closed', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 5 }, { cropId: 'porumb', areaHa: 3, lost: { ha: lostHa, ...(lostHa ? { reason: 'drought' } : {}) } }] });
const farmWith = (expected: object[] = []) => {
  const me = { ...ME, transactions: [], harvests: { years: [year(2025, 1), year(2026, 0.5)], gathered: [], expected }, harvests_version: 3 };
  return { me, saved: { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) } };
};
const maizeFig = () => [...document.querySelectorAll('fieldset.crop-fig')].find((f) => f.querySelector('legend')!.textContent!.startsWith('Porumb'))! as HTMLElement;
const wheatFig = () => [...document.querySelectorAll('fieldset.crop-fig')].find((f) => f.querySelector('legend')!.textContent!.startsWith(WHEAT))! as HTMLElement;

describe('Datele planului: pierderi', () => {
  it('shows the average and each harvest, and says when there is nothing yet', async () => {
    const { me, saved } = farmWith();
    await showPage('date-plan', 'farm', saved, true, me);
    expect(maizeFig().textContent).toContain('Pierderi: în medie 25% din porumb (din recoltele 2025–2026).');
    expect(maizeFig().textContent).toContain('Recolta 2025: 1 ha din 3, secetă');
    expect(maizeFig().textContent).toContain('Recolta 2026: 0,5 ha din 3');
    expect(wheatFig().textContent).toContain('Încă nu știm cât pierzi.');
    /* Maize's yield is the county's here, so the history isn't subtracted (P33), and the farmer is told. */
    expect(maizeFig().textContent).toContain('Scădem pierderea doar din producția ta');
  });

  it("saves the farmer's own % and refuses one over 100", async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('date-plan', 'farm', saved, true, me);
    const field = within(maizeFig()).getByLabelText('Cât pierzi de obicei, în %');
    fireEvent.change(field, { target: { value: '120' } });
    expect(maizeFig().textContent).toContain('Scrie un procent între 0 și 100');
    expect((screen.getByRole('button', { name: 'Salvează' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await vi.waitFor(() => expect(live.write).toHaveBeenCalled());
    expect((live.write as ReturnType<typeof vi.fn>).mock.calls[0]![1].expected).toEqual([{ cropId: 'porumb', yieldTPerHa: null, priceLeiPerKg: null, lossPct: 10 }]);
  });
});

describe('Prognoză: what was subtracted', () => {
  it("says it's the history when the yield is the farmer's", async () => {
    const { me, saved } = farmWith([{ cropId: 'porumb', yieldTPerHa: 7, priceLeiPerKg: null }]);
    await showPage('prognoza', 'farm', saved, true, me);
    expect(document.body.textContent).toContain('Porumb: am scăzut 25% pentru ce nu ajunge la recoltă, din recoltele 2025–2026 ale tale.');
  });

  it("says nothing was subtracted on the county's yield", async () => {
    const { me, saved } = farmWith();
    await showPage('prognoza', 'farm', saved, true, me);
    expect(document.body.textContent).toContain('Porumb: pierzi de obicei 25%, dar producția e media județului');
  });

  it('words each source', () => {
    expect(lossLine('Porumb', { basis: 'this_year', year: 2027, share: 3 / 8, applied: true })).toBe('Porumb: am scăzut 37,5%, cât ai spus că ai pierdut la recolta 2027.');
    expect(lossLine('Porumb', { basis: 'farmer', share: 0.1, applied: true })).toBe('Porumb: am scăzut 10% pentru ce nu ajunge la recoltă, cât ai scris în Datele planului.');
    expect(lossLine('Porumb', { basis: 'none', share: 0, applied: true })).toBeNull();
    expect(lossLine('Porumb', { basis: 'farmer', share: 0, applied: true })).toBeNull();
  });
});
