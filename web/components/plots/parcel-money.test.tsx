// @vitest-environment happy-dom
/* Money and work on a parcel (docs/harta-plan.md, step 10): the „Pe ce parcelă?” picker on Recolte, a
   treatment expense noting its work, and planned parcel work in Acasă's reminders. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmPlots } from '../../../packages/shared/src/plots/index';
import { op, plot, season } from '../../../packages/shared/src/plots/fixtures';
import { showPage, SIGNED_IN } from '../pages/harness';

vi.mock('../map/FarmMapLazy', () => ({ FarmMapLazy: () => <div data-testid="map" /> }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '44444444-4444-4444-8444-444444444444';
const PLOTS: FarmPlots = {
  plots: [plot(A, { name: null, bloc_fizic: '286', parcel_no: '1a' }), plot(B, { name: 'La salcâmi' }), plot(C, { name: 'Lângă drum' })],
  seasons: [season(A, 'grau', 300), season(B, 'grau', 200), season(C, 'porumb', 300)],
  operations: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const form = () => document.querySelector<HTMLFormElement>('form.h-record')!;
const field = (name: RegExp) => within(form()).getByLabelText(name) as HTMLSelectElement;
async function save(f: HTMLFormElement) {
  await act(async () => {
    fireEvent.submit(f);
  });
  await settle();
}

describe('Recolte, „Pe ce parcelă?”', () => {
  it("a sale offers the sold crop's parcels and is filed on the one picked", async () => {
    const page = await showPage('recolte', 'farm', SIGNED_IN, true, undefined, { '/api/plots': PLOTS });
    await settle();
    fireEvent.change(field(/^Cultura/), { target: { value: 'grau' } });
    const pick = field(/Pe ce parcelă/);
    expect([...pick.options].map((o) => o.text)).toEqual(['Toată cultura', 'Bloc 286 · parcela 1a', 'La salcâmi']);
    fireEvent.change(pick, { target: { value: B } });
    fireEvent.change(form().querySelector('input[inputmode="numeric"]')!, { target: { value: '12000' } });
    await save(form());
    expect(page.live.write).toHaveBeenCalledWith('record_sale', expect.objectContaining({ cropId: 'grau', totalLei: 12_000, plotId: B }), expect.anything());
  });

  it('a treatment on a parcel also notes the work, linked to the expense', async () => {
    const page = await showPage('recolte', 'farm', SIGNED_IN, true, undefined, { '/api/plots': PLOTS });
    await settle();
    (page.live.write as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => (name === 'add_expense' ? { id: 'tx-1' } : {}));
    fireEvent.click(screen.getByRole('button', { name: 'Cheltuială' }));
    fireEvent.change(field(/^Pe ce$/), { target: { value: 'treatments' } });
    expect([...field(/Pe ce parcelă/).options].map((o) => o.text)).toEqual(['Toată ferma', 'Bloc 286 · parcela 1a', 'La salcâmi', 'Lângă drum']);
    fireEvent.change(field(/Pe ce parcelă/), { target: { value: C } });
    expect((within(form()).getByRole('checkbox', { name: 'Notează și lucrarea pe parcelă' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(form()).getByRole('button', { name: 'Insecticid' }));
    fireEvent.change(within(form()).getByLabelText(/Ce produs/), { target: { value: 'Karate Zeon' } });
    fireEvent.change(form().querySelector('input[inputmode="numeric"]')!, { target: { value: '900' } });
    await save(form());
    expect(page.live.write).toHaveBeenCalledWith('add_expense', expect.objectContaining({ category: 'treatments', amountLei: 900, plotId: C }), expect.anything());
    expect(page.live.write).toHaveBeenCalledWith(
      'add_operation',
      expect.objectContaining({ plotId: C, kind: 'insecticide', status: 'done', onDate: '2026-11-15', product: 'Karate Zeon', transactionId: 'tx-1' }),
      expect.anything(),
    );
  });

  it('unticked, only the money is noted; without internet both wait in the queue', async () => {
    const page = await showPage('recolte', 'farm', SIGNED_IN, true, undefined, { '/api/plots': PLOTS });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Cheltuială' }));
    fireEvent.change(field(/^Pe ce$/), { target: { value: 'treatments' } });
    fireEvent.change(field(/Pe ce parcelă/), { target: { value: A } });
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'Notează și lucrarea pe parcelă' }));
    fireEvent.change(form().querySelector('input[inputmode="numeric"]')!, { target: { value: '500' } });
    await save(form());
    expect((page.live.write as ReturnType<typeof vi.fn>).mock.calls.map(([n]) => n)).toEqual(['add_expense']);
    cleanup();
    localStorage.setItem('cropcash-plots', JSON.stringify({ plots: PLOTS, at: '2026-11-14T10:00:00Z' }));
    const off = await showPage('recolte', 'farm', SIGNED_IN, false);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Cheltuială' }));
    fireEvent.change(field(/^Pe ce$/), { target: { value: 'treatments' } });
    fireEvent.change(field(/Pe ce parcelă/), { target: { value: A } });
    expect((within(form()).getByRole('checkbox', { name: 'Notează și lucrarea pe parcelă' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(form().querySelector('input[inputmode="numeric"]')!, { target: { value: '700' } });
    await save(form());
    const queue = off.store.getState().farm!.outbox;
    expect(queue.map((i) => i.name)).toEqual(['add_expense', 'add_operation']);
    expect(queue[1]!.input).toMatchObject({ plotId: A, kind: 'fungicide', status: 'done', onDate: '2026-11-15', transactionId: null });
    expect(typeof queue[1]!.input.clientId).toBe('string');
  });

  it("Ion's farm has no picker: its records stay on the phone, by crop", async () => {
    await showPage('recolte', 'demo');
    await settle();
    expect(within(form()).queryByLabelText(/Pe ce parcelă/)).toBeNull();
  });
});

describe('Acasă, planned parcel work', () => {
  it('reminds of work due soon or late, and opens the parcel on Harta', async () => {
    const plots: FarmPlots = {
      ...PLOTS,
      operations: [
        op('o1', A, { kind: 'fungicide', status: 'planned', on_date: '2026-11-20', product: 'Falcon' }),
        op('o2', B, { kind: 'herbicide', status: 'planned', on_date: '2026-11-12' }),
        op('o3', C, { kind: 'herbicide', status: 'planned', on_date: '2027-04-01' }),
        op('o4', C, { kind: 'fungicide', status: 'done', on_date: '2026-11-14' }),
      ],
    };
    await showPage('acasa', 'farm', SIGNED_IN, true, undefined, { '/api/plots': plots });
    await settle();
    const box = within(document.querySelector<HTMLElement>('.ev-nudges')!);
    const rows = box.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);
    expect(rows).toEqual([
      ['Erbicid pe La salcâmiÎntârziat, de acum 3 zile', `/harta?parcela=${B}`],
      ['Fungicid (Falcon) pe Bloc 286 · parcela 1aÎn 5 zile', `/harta?parcela=${A}`],
    ]);
  });
});

describe('a parcel card, „Adaugă cheltuială aici”', () => {
  it('a treatment there notes the work too', async () => {
    history.replaceState(null, '', `/harta?parcela=${A}`);
    const page = await showPage('harta', 'farm', SIGNED_IN, true, undefined, { '/api/plots': PLOTS });
    await settle();
    (page.live.write as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => (name === 'add_expense' ? { id: 'tx-2' } : {}));
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă cheltuială aici' }));
    const sheet = document.querySelector<HTMLFormElement>('form.ev-form')!;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Erbicid' }));
    fireEvent.change(within(sheet).getByLabelText(/Cât ai plătit/), { target: { value: '1200' } });
    await save(sheet);
    expect(page.live.write).toHaveBeenCalledWith('add_expense', expect.objectContaining({ category: 'treatments', plotId: A }), expect.anything());
    expect(page.live.write).toHaveBeenCalledWith('add_operation', expect.objectContaining({ plotId: A, kind: 'herbicide', status: 'done', transactionId: 'tx-2' }), expect.anything());
    expect(within(sheet).getByRole('status').textContent).toBe('Am notat cheltuiala și tratamentul.');
    history.replaceState(null, '', '/');
  });
});
