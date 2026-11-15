// @vitest-environment happy-dom
/* /harta with the worst a real farm can send (docs/harta-plan.md, step 11): no parcels, one, 150, a parcel
   with no shape at all, a very long name, and one bloc split into five parcels. The map is a fake that
   lists what it was given; crossed edges in a drawing are refused by the editor (ShapeEditor.test). */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmPlots } from '../../../packages/shared/src/plots/index';
import { plot, season } from '../../../packages/shared/src/plots/fixtures';
import type { FarmMapProps } from '../map/FarmMap';
import { showPage, SIGNED_IN } from '../pages/harness';

const map = vi.hoisted(() => ({ props: null as FarmMapProps | null }));
vi.mock('../map/FarmMapLazy', () => ({
  FarmMapLazy: (p: FarmMapProps) => {
    map.props = p;
    return <div data-testid="map" />;
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  map.props = null;
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

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const side = () => within(document.querySelector<HTMLElement>('.hm-side')!);
const rowButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.hm-side .pl-row')];
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const at = (n: number) => ({ centroid_lng: 24.9 + (n % 15) * 0.01, centroid_lat: 44.1 + Math.floor(n / 15) * 0.01, geometry_source: 'approx' as const });

async function open(plots: FarmPlots) {
  const page = await showPage('harta', 'farm', SIGNED_IN, true, undefined, { '/api/plots': plots });
  await settle();
  return page;
}

describe('/harta, worst cases', () => {
  it('no parcels: says so and offers the cerere, with an empty map', async () => {
    await open({ plots: [], seasons: [], operations: [] });
    expect(side().getByText('Nu ai încă parcele.')).toBeTruthy();
    expect(side().getByText(/Pune-le din cererea de plată APIA/)).toBeTruthy();
    expect(map.props!.rows).toEqual([]);
  });

  it('one parcel: one row, and the map gets it', async () => {
    await open({ plots: [plot(id(1), { name: 'Singura', ...at(1) })], seasons: [season(id(1), 'grau', 1500)], operations: [] });
    expect(rowButtons()).toHaveLength(1);
    expect(map.props!.rows.map((r) => r.plot.id)).toEqual([id(1)]);
  });

  it('150 parcels: every one is listed and on the map, and „Pe culturi” adds them up', async () => {
    const n = Array.from({ length: 150 }, (_, i) => i + 1);
    const crops = ['grau', 'porumb', 'floarea'];
    await open({
      plots: n.map((i) => plot(id(i), { bloc_fizic: String(100 + i), parcel_no: '1', ...at(i) })),
      seasons: n.map((i) => season(id(i), crops[i % 3]!, 50)),
      operations: [],
    });
    expect(rowButtons()).toHaveLength(150);
    expect(map.props!.rows).toHaveLength(150);
    fireEvent.click(screen.getByRole('button', { name: 'Pe culturi' }));
    const byCrop = rowButtons().map((b) => b.textContent ?? '');
    expect(byCrop).toHaveLength(3);
    for (const text of byCrop) expect(text).toMatch(/50 de parcele · 25 ha/);
  });

  it('a parcel with no shape and no middle: listed as not on the map, and its card opens', async () => {
    await open({
      plots: [plot(id(1), { name: 'Fără desen', geometry: null, shape: null, centroid_lat: null, centroid_lng: null, geometry_source: 'none' })],
      seasons: [season(id(1), 'porumb', 300)],
      operations: [],
    });
    expect(screen.getByText('Nicio parcelă nu are încă loc pe hartă.')).toBeTruthy();
    fireEvent.click(rowButtons()[0]!);
    expect(screen.getByRole('heading', { name: /Fără desen/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desenează pe hartă' })).toBeTruthy();
  });

  it('a very long name without spaces shows whole, in the row and on the card', async () => {
    const long = 'ParcelaDeLângăPădureaMareDinspreDrumulCătreMăldăeniȘiMaiDepartePesteVale'.padEnd(80, 'x');
    await open({ plots: [plot(id(1), { name: long, ...at(1) })], seasons: [season(id(1), 'grau', 200)], operations: [] });
    expect(rowButtons()[0]!.textContent).toContain(long);
    fireEvent.click(rowButtons()[0]!);
    expect(screen.getByRole('heading', { name: long })).toBeTruthy();
  });

  it('one bloc split into five parcels: five rows, each told apart by its number', async () => {
    const nos = ['1a', '1b', '1c', '1d', '1e'];
    await open({
      plots: nos.map((no, i) => plot(id(i + 1), { bloc_fizic: '286', parcel_no: no, ...at(1) })),
      seasons: nos.map((_, i) => season(id(i + 1), i < 3 ? 'grau' : 'porumb', 160)),
      operations: [],
    });
    const names = rowButtons().map((b) => /Bloc 286 · parcela 1[a-e]/.exec(b.textContent ?? '')?.[0]);
    expect(names.sort()).toEqual(nos.map((no) => `Bloc 286 · parcela ${no}`));
    expect(map.props!.rows).toHaveLength(5);
  });
});
