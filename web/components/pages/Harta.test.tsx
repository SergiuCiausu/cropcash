// @vitest-environment happy-dom
/* /harta (docs/harta-plan.md, step 8) with the map replaced by a fake that lists the parcels it was
   given and records where it was asked to fly. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useImperativeHandle, type Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmPlots } from '../../../packages/shared/src/plots/index';
import { plot, season } from '../../../packages/shared/src/plots/fixtures';
import type { FarmMapHandle, FarmMapProps } from '../map/FarmMap';
import { ME, showPage, SIGNED_IN } from './harness';

const map = vi.hoisted(() => ({ props: null as FarmMapProps | null, flights: [] as string[], fits: [] as (readonly string[] | undefined)[] }));
vi.mock('../map/FarmMapLazy', () => ({
  FarmMapLazy: (p: FarmMapProps & { ref?: Ref<FarmMapHandle> }) => {
    map.props = p;
    useImperativeHandle(p.ref, () => ({ flyToPlot: (id) => void map.flights.push(id), fitPlots: (ids) => void map.fits.push(ids) }));
    return (
      <div data-testid="map">
        {p.rows.map((r) => (
          <button key={r.plot.id} type="button" onClick={() => p.onSelect?.(r.plot.id)}>
            pe hartă {r.plot.id}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  map.props = null;
  map.flights = [];
  map.fits = [];
  localStorage.clear();
  history.replaceState(null, '', '/harta');
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

const list = () => within(document.querySelector<HTMLElement>('.hm-side')!);
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("/harta on Ion's farm", () => {
  it('lists his two real blocs, opens a card, and Back closes it', async () => {
    await showPage('harta', 'demo');
    expect(screen.getByRole('heading', { level: 1, name: 'Harta' })).toBeTruthy();
    expect(map.props!.rows.map((r) => r.plot.bloc_fizic)).toEqual(['286', '293']);
    fireEvent.click(list().getByRole('button', { name: /Bloc 286/ }));
    expect(location.search).toBe('?parcela=ion-grau');
    expect(map.flights).toEqual(['ion-grau']);
    expect(screen.getByRole('heading', { level: 2, name: 'Bloc 286' })).toBeTruthy();
    expect(screen.getByText(/Blocul fizic 286, satul Măldăeni, comuna Măldăeni, Teren arabil/)).toBeTruthy();
    // Ion's farm is only to look at.
    expect(screen.queryByRole('button', { name: 'Adaugă cheltuială aici' })).toBeNull();
    expect(screen.getByText(/Pe ferma lui Ion te uiți doar/)).toBeTruthy();
    await act(async () => {
      history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(location.search).toBe('');
    expect(screen.queryByRole('heading', { level: 2, name: 'Bloc 286' })).toBeNull();
  });

  it('a parcel tapped on the map opens the same card; × closes it', async () => {
    await showPage('harta', 'demo');
    fireEvent.click(screen.getByRole('button', { name: 'pe hartă ion-porumb' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Bloc 293' })).toBeTruthy();
    expect(map.props!.selectedIds).toEqual(['ion-porumb']);
    fireEvent.click(screen.getByRole('button', { name: 'Închide fișa parcelei' }));
    await settle();
    expect(screen.queryByRole('heading', { level: 2, name: 'Bloc 293' })).toBeNull();
  });

  it('opens on the card named in the address', async () => {
    history.replaceState(null, '', '/harta?parcela=ion-porumb');
    await showPage('harta', 'demo');
    expect(screen.getByRole('heading', { level: 2, name: 'Bloc 293' })).toBeTruthy();
  });

  it('„Pe culturi”: one row per crop, which picks its parcels on the map', async () => {
    history.replaceState(null, '', '/harta?vedere=culturi');
    await showPage('harta', 'demo');
    const wheat = list().getByRole('button', { name: /Grâu/ });
    expect(wheat.textContent).toMatch(/o parcelă · 8 ha/);
    fireEvent.click(wheat);
    expect(map.props!.selectedIds).toEqual(['ion-grau']);
    expect(map.fits.at(-1)).toEqual(['ion-grau']);
    // It opens to its parcels.
    expect(list().getByRole('button', { name: /Bloc 286/ })).toBeTruthy();
  });

  it('filters leave the other parcels faint on the map', async () => {
    history.replaceState(null, '', '/harta?cultura=porumb');
    await showPage('harta', 'demo');
    expect(list().queryByRole('button', { name: /Bloc 286/ })).toBeNull();
    expect(map.props!.dimmedIds).toEqual(['ion-grau']);
  });
});

/* A farm on the server: one parcel on the map with work late, and one crop not placed yet. */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const OP = '33333333-3333-4333-8333-333333333333';
const PLOTS: FarmPlots = {
  plots: [
    plot(A, { name: 'La salcâmi', siruta: 153277, bloc_fizic: '286', centroid_lng: 24.96, centroid_lat: 44.11, geometry_source: 'approx' }),
    plot(B, { auto_crop_id: 'porumb', bloc_fizic: null, parcel_no: null, siruta: null, geometry: null, geometry_source: 'none' }),
  ],
  seasons: [season(A, 'grau', 500), season(A, 'porumb', 500, { harvest_year: 2026 }), season(B, 'porumb', 300)],
  operations: [
    { id: OP, plot_id: A, harvest_year: 2027, kind: 'fungicide', status: 'planned', on_date: '2026-11-10', product: null, dose: null, transaction_id: null, template_id: null },
  ],
};
const ME_WITH_MONEY = {
  ...ME,
  transactions: [{ id: 't1', kind: 'expense', category: 'seeds', crop_id: 'grau', amount_bani: -100_000, occurred_at: '2026-10-05T12:00:00Z', harvest_year: 2027, source: 'manual' }],
};

describe('/harta on a farm of its own', () => {
  it('reads the parcels, says what is late, and keeps a copy for offline', async () => {
    const page = await showPage('harta', 'farm', SIGNED_IN, true, ME_WITH_MONEY, { '/api/plots': PLOTS });
    await settle();
    const salcami = list().getByRole('button', { name: /La salcâmi/ });
    expect(salcami.textContent).toMatch(/Fungicid, întârziat de acum 5 zile/);
    expect(list().getByRole('button', { name: /fără loc pe hartă/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adaugă parcele din cererea APIA' })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('cropcash-plots')!).plots.plots).toHaveLength(2);

    fireEvent.click(salcami);
    // Wheat's seed money is shared over its only parcel, and says so.
    expect(screen.getByText(/1.000 lei sunt împărțiți pe suprafață din cheltuielile pe grâu/)).toBeTruthy();
    expect(screen.getByText('Recolta 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Marchează făcut' }));
    await settle();
    expect(page.live.write).toHaveBeenCalledWith('update_operation', expect.objectContaining({ id: OP, status: 'done', onDate: '2026-11-15' }), expect.anything());
  });

  it('without internet, shows the copy on the phone and says from when', async () => {
    localStorage.setItem('cropcash-plots', JSON.stringify({ plots: PLOTS, at: '2026-11-14T10:00:00Z' }));
    await showPage('harta', 'farm', SIGNED_IN, false, ME, { '/api/plots': PLOTS });
    await settle();
    expect(screen.getByText(/Fără internet. Arătăm parcelele așa cum erau pe 14 nov. 2026/)).toBeTruthy();
    expect(list().getByRole('button', { name: /La salcâmi/ })).toBeTruthy();
  });

  it('without internet, „Marchează făcut” waits in the queue and the card shows it done', async () => {
    localStorage.setItem('cropcash-plots', JSON.stringify({ plots: PLOTS, at: '2026-11-14T10:00:00Z' }));
    const page = await showPage('harta', 'farm', SIGNED_IN, false, ME, { '/api/plots': PLOTS });
    await settle();
    fireEvent.click(list().getByRole('button', { name: /La salcâmi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Marchează făcut' }));
    await settle();
    expect(page.live.write).not.toHaveBeenCalled();
    expect(page.store.getState().farm!.outbox.map((i) => [i.name, i.input])).toEqual([['update_operation', { id: OP, status: 'done', onDate: '2026-11-15' }]]);
    const card = within(document.querySelector<HTMLElement>('.pc')!);
    expect(card.queryByRole('button', { name: 'Marchează făcut' })).toBeNull();
    expect(card.getByText(/Făcut pe 15 nov\. 2026.*se trimite când ai internet/)).toBeTruthy();
    // „Adaugă lucrare” and drawing don't wait for internet any more.
    expect((card.getByRole('button', { name: 'Adaugă lucrare' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a card for hectares not on the map offers the cerere', async () => {
    await showPage('harta', 'farm', SIGNED_IN, true, ME, { '/api/plots': PLOTS });
    await settle();
    fireEvent.click(list().getByRole('button', { name: /fără loc pe hartă/ }));
    expect(screen.getByText(/Hectarele astea nu au încă loc pe hartă/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pune parcelele din cererea APIA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Desenează/ })).toBeNull();
  });
});
