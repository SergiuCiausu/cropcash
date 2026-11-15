// @vitest-environment happy-dom
/* The corner map on every page (docs/harta-plan.md, step 9), with the map itself replaced by a fake. */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmPlots } from '../../../packages/shared/src/plots/index';
import { plot, season } from '../../../packages/shared/src/plots/fixtures';
import { showPage, SIGNED_IN } from '../pages/harness';
import type { FarmMapProps } from './FarmMap';

const map = vi.hoisted(() => ({ props: null as FarmMapProps | null }));
vi.mock('./FarmMapLazy', () => ({
  FarmMapLazy: (p: FarmMapProps) => {
    map.props = p;
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

let phone = false;
const assign = vi.fn();
beforeEach(() => {
  phone = false;
  map.props = null;
  assign.mockReset();
  localStorage.clear();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone && q.includes('760px'), addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('location', { ...location, assign, search: '', href: 'http://localhost/acasa' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the corner map', () => {
  it("on Ion's farm: a button that opens a small map of his blocs, remembered", async () => {
    await showPage('acasa', 'demo');
    expect(screen.queryByTestId('map')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arată harta parcelelor' }));
    expect(map.props!.mode).toBe('mini');
    expect(map.props!.rows.map((r) => r.plot.bloc_fizic)).toEqual(['286', '293']);
    expect(localStorage.getItem('cropcash-demo-minimap')).toBe('1');
    expect(screen.getByRole('link', { name: 'Deschide harta mare' }).getAttribute('href')).toBe('/ferma-lui-ion/harta');
    fireEvent.click(screen.getByRole('button', { name: 'pe hartă ion-porumb' }));
    expect(assign).toHaveBeenCalledWith('/ferma-lui-ion/harta?parcela=ion-porumb');
    fireEvent.click(screen.getByRole('button', { name: 'Ascunde harta' }));
    expect(screen.queryByTestId('map')).toBeNull();
    expect(localStorage.getItem('cropcash-demo-minimap')).toBeNull();
  });

  it('opens by itself when it was left open', async () => {
    localStorage.setItem('cropcash-demo-minimap', '1');
    await showPage('salariu', 'demo');
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('a phone gets only a link to /harta', async () => {
    phone = true;
    localStorage.setItem('cropcash-demo-minimap', '1');
    await showPage('acasa', 'demo');
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByRole('link', { name: 'Harta parcelelor' }).getAttribute('href')).toBe('/ferma-lui-ion/harta');
  });

  it('is not on /harta itself', async () => {
    await showPage('harta', 'demo');
    expect(screen.queryByRole('button', { name: 'Arată harta parcelelor' })).toBeNull();
  });

  it('asks the server for the parcels only once it is opened', async () => {
    const plots: FarmPlots = { plots: [plot('11111111-1111-4111-8111-111111111111', { centroid_lng: 24.9, centroid_lat: 44.1 })], seasons: [season('11111111-1111-4111-8111-111111111111', 'grau', 500)], operations: [] };
    /* Not Acasă: its reminders read the parcels for their planned work. */
    const page = await showPage('salariu', 'farm', SIGNED_IN, true, undefined, { '/api/plots': plots });
    const asked = () => (page.live.api as ReturnType<typeof vi.fn>).mock.calls.filter(([p]) => String(p).startsWith('/api/plots')).length;
    expect(asked()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Arată harta parcelelor' }));
    await vi.waitFor(() => expect(map.props?.rows).toHaveLength(1));
    expect(asked()).toBe(1);
  });

  it('with no parcel on the map, a chip that says what to do', async () => {
    const plots: FarmPlots = { plots: [plot('b', { auto_crop_id: 'grau', geometry: null, geometry_source: 'none' })], seasons: [season('b', 'grau', 500)], operations: [] };
    localStorage.setItem('cropcash-plots', JSON.stringify({ plots, at: '2026-11-14T10:00:00Z' }));
    await showPage('acasa', 'farm', SIGNED_IN);
    expect(screen.getByRole('link', { name: 'Pune parcelele pe hartă' }).getAttribute('href')).toBe('/harta');
    expect(screen.queryByRole('button', { name: 'Arată harta parcelelor' })).toBeNull();
  });
});
