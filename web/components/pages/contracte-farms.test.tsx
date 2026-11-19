// @vitest-environment happy-dom
/* Contracte, „Toate fermele” (docs/contracts-plan.md §6, step 7): the toggle shows only with two farms or more, the
   numbers come from GET /api/farms/contracts-summary, and nothing is asked of the server offline or on Ion's farm. */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATH = '/api/farms/contracts-summary';
const taxes = (toStateBani: number) => ({ toStateBani, withheldBani: 0, deductibleBani: 0, costBani: 0, unknown: 0 });
const farm = (farmId: string, name: string, role: string, over: object = {}) => ({
  farmId,
  name,
  role,
  arenda: true,
  today: '2026-11-15',
  count: 2,
  inBani: 0,
  outBani: 1_000_000,
  taxes: taxes(50_000),
  takenAri: 500,
  givenAri: 0,
  landowners: 3,
  due: [],
  taxMonths: [],
  ...over,
});
const due = {
  farmId: 'b',
  farmName: 'Ferma Vida',
  contractId: 'c2',
  source: 'contract',
  kind: 'insurance',
  party: 'Groupama',
  day: '2027-01-31',
  status: 'decide_soon',
};
const two = {
  farms: [farm('a', 'Ferma Ana', 'owner'), farm('b', 'Ferma Vida', 'manager', { outBani: 2_000_000, takenAri: 0, givenAri: 200, due: [due] })],
  total: { count: 4, inBani: 0, outBani: 3_000_000, taxes: taxes(100_000), takenAri: 500, givenAri: 200, landowners: 6, due: 1 },
  due: [due],
  taxMonths: [
    {
      month: '2026-12',
      totals: taxes(100_000),
      farms: [
        { farmId: 'a', farmName: 'Ferma Ana', totals: taxes(50_000) },
        { farmId: 'b', farmName: 'Ferma Vida', totals: taxes(50_000) },
      ],
    },
  ],
  missing: [],
};
const one = { ...two, farms: [two.farms[0]], due: [], taxMonths: [] };
const text = () => document.querySelector('main')!.textContent!;
const summaryCalls = (live: { api: unknown }) => (live.api as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === PATH);

describe('Contracte, „Toate fermele”', () => {
  it('one farm: no toggle', async () => {
    const { live } = await showPage('contracte', 'farm', SIGNED_IN, true, ME, { [PATH]: one });
    expect(summaryCalls(live).length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Toate fermele' })).toBeNull();
  });

  it('two farms: the totals, each farm, and the merged „De hotărât” tagged with its farm', async () => {
    const { live } = await showPage('contracte', 'farm', SIGNED_IN, true, ME, { [PATH]: two });
    expect(screen.getByRole('button', { name: 'Doar ferma asta' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toate fermele' }));
    });
    await act(async () => undefined);
    // Opening it asks again, so a decision just noted on this farm shows.
    expect(summaryCalls(live).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Toate fermele' }).getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('30.000 lei');
    expect(text()).toContain('iei 5 ha, dai 2 ha');
    expect(text()).toContain('Ferma Ana');
    expect(text()).toContain('Groupama');
    expect(text()).toContain('Totalul e ca să vezi tot, nu pentru declarații.');
    expect(text()).toContain('îi numărăm pe fiecare fermă');
    expect(text()).not.toMatch(/NaN|undefined|\[object Object\]/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Doar ferma asta' }));
    });
    expect(screen.getByRole('button', { name: 'Toate' })).toBeTruthy();
  });

  it('names a farm it couldn’t read, and says when an accountant doesn’t see the arendă', async () => {
    const odd = { ...two, farms: [two.farms[0], { ...two.farms[1], role: 'accountant', arenda: false }], missing: ['Ferma Deal'] };
    await showPage('contracte', 'farm', SIGNED_IN, true, ME, { [PATH]: odd });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toate fermele' }));
    });
    await act(async () => undefined);
    expect(text()).toContain('Fără Ferma Deal: n-am putut-o citi acum.');
    expect(text()).toContain('La Ferma Vida ești contabil');
  });

  it('offline, and on Ion’s farm: nothing asked of the server, no toggle', async () => {
    const offline = await showPage('contracte', 'farm', SIGNED_IN, false, ME, { [PATH]: two });
    expect(summaryCalls(offline.live)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Toate fermele' })).toBeNull();
    cleanup();
    const ion = await showPage('contracte', 'demo', {}, true, ME, { [PATH]: two });
    expect(summaryCalls(ion.live)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Toate fermele' })).toBeNull();
  });
});
