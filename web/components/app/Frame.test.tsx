// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { viewFor } from '../../lib/cc/plan';
import { FarmProvider } from '../../lib/cc/react';
import { memoryStore } from '../../lib/cc/storage';
import { createStore, type LiveCalls } from '../../lib/cc/store';
import type { Mode } from '../../lib/paths';
import Frame from './Frame';
import { ErrorLine, Money, NetButton } from './bits';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
const ME = {
  name: 'Maria',
  county: 'TR',
  birth_year: 1970,
  start_balance_bani: 2_000_000,
  parcels: [{ crop_id: 'grau', area_ari: 500, planted_month: '2026-10' }],
  transactions: [],
  task_completions: [],
  pension_plans: [],
  opportunity_follows: [],
};

function makeStore(mode: Mode, saved: Record<string, string> = {}, online = true) {
  const live: LiveCalls = {
    api: vi.fn(async () => ({ farmer: ME }) as never),
    read: vi.fn(async () => ({ data: [] }) as never),
    write: vi.fn(async () => ({}) as never),
  };
  const store = createStore({
    mode,
    store: memoryStore(saved),
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => online, fetchFn: (async () => ({ ok: online })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  return { store, live };
}

async function show(mode: Mode, page: string, saved?: Record<string, string>, online = true) {
  const { store, live } = makeStore(mode, saved, online);
  await act(async () => {
    render(
      <FarmProvider mode={mode} store={store}>
        <Frame page={page} mode={mode}>
          <h1>Conținut</h1>
          <Money bani={123456} />
          <NetButton reason="Pornește internetul ca să plătești.">Plătește</NetButton>
        </Frame>
      </FarmProvider>,
    );
  });
  await act(async () => undefined);
  return { store, live };
}

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the frame', () => {
  it("draws Ion's farm with the demo strip and links inside /ferma-lui-ion", async () => {
    const { live } = await show('demo', '/oportunitati');
    expect(screen.getByRole('heading', { name: 'Conținut' })).toBeTruthy();
    expect(screen.getByText(/Asta e ferma lui Ion/)).toBeTruthy();
    const tab = screen.getByRole('link', { name: 'Subvenții' });
    expect(tab.getAttribute('href')).toBe('/ferma-lui-ion/subventii');
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('1.235 lei')).toBeTruthy();
    expect(screen.queryByText('Ieși din cont')).toBeNull();
    expect(live.api).not.toHaveBeenCalled();
  });

  it('shows "Toată ferma" on whole-farm pages and the year picker on the others', async () => {
    await show('demo', '/salariu');
    expect(screen.getAllByText('Toată ferma').length).toBeGreaterThan(0);
    expect(document.querySelector('.crop-tabs')).toBeNull();
    cleanup();
    await show('demo', '/recolte');
    const chip = document.querySelector('button.h-chip') as HTMLButtonElement;
    expect(chip.textContent).toMatch(/^Recolta \d{4}$/);
    fireEvent.click(chip);
    expect(screen.getByRole('heading', { name: 'Alege recolta' })).toBeTruthy();
  });

  const tab = (name: RegExp) => screen.getByRole('button', { name });

  it.each(['/acasa', '/subventii', '/calendar', '/prognoza', '/recolte'])('switches crops on %s in place: same frame, same address', async (page) => {
    const { store } = await show('demo', page);
    const frame = document.querySelector('.app');
    const address = location.href;
    expect(tab(/^Toată ferma/).getAttribute('aria-pressed')).toBe('true');
    await act(async () => fireEvent.click(tab(/^Porumb/)));
    expect(tab(/^Porumb/).getAttribute('aria-pressed')).toBe('true');
    expect(tab(/^Toată ferma/).getAttribute('aria-pressed')).toBe('false');
    expect(store.getState().farm?.harvests?.crop).toBe('porumb');
    expect(document.querySelector('.app')).toBe(frame);
    expect(location.href).toBe(address);
    await act(async () => fireEvent.click(tab(/^Toată ferma/)));
    expect(store.getState().farm?.harvests?.crop).toBeNull();
  });

  it('keeps the picked crop when moving to another page', async () => {
    const { store } = await show('demo', '/calendar');
    await act(async () => fireEvent.click(tab(/^Grâu/)));
    expect(store.getState().farm?.harvests?.crop).toBe('grau');
    cleanup();
    const saved = store.getState().farm!;
    expect(viewFor(saved, 'farm').tabCrop).toBe('grau');
    expect(viewFor(saved, 'picked').selectedCrop).toBe('grau');
  });

  it('keeps the tabs above a finished crop', async () => {
    const harvests = JSON.stringify({
      selected: 'r2027',
      crop: 'grau',
      items: [{ id: 'r2027', year: 2027, status: 'open', openingBani: 0, summary: '', records: [], parcels: [{ cropId: 'grau', areaHa: 8, status: 'closed' }, { cropId: 'porumb', areaHa: 7 }] }],
    });
    await show('demo', '/calendar', { 'cropcash-demo-harvests': harvests });
    expect(screen.getByRole('heading', { name: 'Plan și realitate' })).toBeTruthy();
    expect(tab(/^Grâu/).textContent).toContain('încheiată');
    await act(async () => fireEvent.click(tab(/^Porumb/)));
    expect(screen.queryByRole('heading', { name: 'Plan și realitate' })).toBeNull();
  });

  it('resets what the visitor changed on Ion\'s farm', async () => {
    const { store } = await show('demo', '/salariu', { 'cropcash-demo-pension': '50000', 'cropcash-currency': 'RON' });
    expect(store.getState().farm?.ownPension).toBe(50000);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Pornește din nou' })[0]));
    expect(store.getState().farm?.ownPension).toBeNull();
  });

  it('draws a signed-in farm, with the way to the account', async () => {
    await show('farm', '/salariu', { 'sb-x-auth-token': '{}', 'cropcash-me': JSON.stringify(ME) });
    expect(screen.getByText(/Maria, Teleorman/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Contul tău' })[0].getAttribute('href')).toBe('/bani');
    expect(screen.queryByText(/ferma lui Ion/)).toBeNull();
  });

  it('turns off buttons that need internet, and says why', async () => {
    await show('farm', '/salariu', { 'sb-x-auth-token': '{}', 'cropcash-me': JSON.stringify(ME), 'cropcash-me-at': '2020-01-01T10:00:00Z' }, false);
    const pay = screen.getByRole('button', { name: 'Plătește' }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    expect(pay.getAttribute('data-needs-net')).toBe('Pornește internetul ca să plătești.');
    expect(screen.getByText(/Fără internet\. Datele sunt din/)).toBeTruthy();
    expect(screen.getByText(/Au mai mult de o săptămână/)).toBeTruthy();
  });

  it('sends a visitor with no session to login', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...location, replace, search: '', hash: '', pathname: '/calendar', href: 'http://localhost/calendar' });
    await show('farm', '/calendar');
    expect(replace).toHaveBeenCalledWith('/login?next=%2Fcalendar');
    expect(screen.queryByText('Conținut')).toBeNull();
  });

  it("keeps the assistant for a real farm: on Ion's farm it shows examples and offers an account", async () => {
    await show('demo', '/acasa');
    fireEvent.click(screen.getByRole('button', { name: 'Întreabă' }));
    expect(within(document.querySelector<HTMLElement>('dialog.ask-sheet')!).getByRole('link', { name: 'Fă-ți cont' })).toBeTruthy();
    expect(screen.queryByLabelText('Întrebarea ta')).toBeNull();
  });

  it('sends a test notification from the bell', async () => {
    await show('demo', '/acasa');
    fireEvent.click(screen.getAllByRole('button', { name: 'Probează notificările' })[0]);
    const send = screen.getAllByRole('button', { name: 'Trimite' }).find((b) => !(b as HTMLButtonElement).disabled)!;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    await act(async () => fireEvent.click(send));
    expect(document.querySelectorAll('.ntf').length).toBe(1);
  });
});

describe('ErrorLine', () => {
  afterEach(cleanup);

  it('says what went wrong, out loud', () => {
    render(<ErrorLine>Nu s-a salvat.</ErrorLine>);
    expect(screen.getByRole('alert').textContent).toBe('Nu s-a salvat.');
  });

  it('draws nothing with no message', () => {
    const { container } = render(<ErrorLine>{null}</ErrorLine>);
    expect(container.innerHTML).toBe('');
  });
});
