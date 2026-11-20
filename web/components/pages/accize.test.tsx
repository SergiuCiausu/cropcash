// @vitest-environment happy-dom
/* „Accize” on /subventii (docs/accize-plan.md §4): the two groups from docs/data/excise-schemes.json, the acord
   switch, and the diesel refund it puts in the salary. Ion's farm keeps it on the phone; a signed-in farm sends it,
   or queues it offline (it only notes the acord). */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showPage } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = () => screen.getByRole('heading', { name: 'Accize: bani înapoi de la stat' }).closest('section')!;
const choices = () => within(card()).getByRole('group', { name: 'Banii înapoi din acciza la motorină, 2026' });
const pressed = () => within(choices()).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent;

/** A signed-in farm with an approved diesel acord and 300 l bought on 10 September 2026. */
const MARIA = {
  ...ME,
  transactions: [{ id: 't1', amount_bani: -250_000, kind: 'expense', category: 'diesel', occurred_at: '2026-09-10T09:00:00Z', fuel_liters_cl: 30_000, source: 'manual' }],
  farm_excise_schemes: [{ scheme_id: 'motorina-hg1174', year: 2026, status: 'approved', acord_on: '2025-12-19' }],
};
const signedIn = (me: object) => ({ 'sb-x-auth-token': '{}', 'cropcash-me': JSON.stringify(me), 'cropcash-me-at': '2026-11-14T10:00:00Z' });

describe('Accize', () => {
  it("shows Ion's acord and both groups, without asking the server", async () => {
    const { live } = await showPage('subventii', 'demo');
    const text = card().textContent!;
    expect(text).toContain('Îți aduce bani');
    expect(text).toContain('Plătești mai puțin');
    expect(text).toContain('Doar propunere, nu e lege');
    expect(text).toContain('Țuică din fructele tale, fără acciză');
    expect(pressed()).toBe('Am primit acordul');
    // Ion has no diesel litres noted yet, so nothing is invented.
    expect(text).toContain('Încă nu intră nimic în salariu');
    // The scheme ends this year and nothing is announced for the next.
    expect(text).toContain('Pentru 2027 nu s-a anunțat încă nimic');
    expect(live.api).not.toHaveBeenCalledWith(expect.stringContaining('/api/excise'));
  });

  it("keeps a change on Ion's farm on the phone", async () => {
    const { live } = await showPage('subventii', 'demo');
    await act(async () => fireEvent.click(within(choices()).getByRole('button', { name: 'Am depus acordul' })));
    expect(pressed()).toBe('Am depus acordul');
    expect(card().textContent).toContain('apasă „Am primit acordul”');
    expect(live.write).not.toHaveBeenCalled();
  });

  it('puts the refund of the noted litres in the salary, and sends a change', async () => {
    const { live } = await showPage('subventii', 'farm', signedIn(MARIA), true, MARIA);
    // 300 l × 1,996 lei/l (reduced excise from 1 September) = 598,80 lei, shown in whole lei.
    expect(card().textContent).toContain('În plan: 599 lei, o plată');
    expect(within(card()).getByText('În salariu')).toBeTruthy();
    await act(async () => fireEvent.click(within(choices()).getByRole('button', { name: 'Nu' })));
    expect(live.write).toHaveBeenCalledWith('set_excise_enrollment', { schemeId: 'motorina-hg1174', year: 2026, status: 'left', acordOn: null }, expect.anything());
  });

  it('queues a change made offline, and shows it already', async () => {
    const { live, store } = await showPage('subventii', 'farm', signedIn(MARIA), false, MARIA);
    await act(async () => fireEvent.click(within(choices()).getByRole('button', { name: 'Am depus acordul' })));
    expect(live.write).not.toHaveBeenCalled();
    expect(store.getState().farm!.outbox.map((i) => i.name)).toContain('set_excise_enrollment');
    expect(pressed()).toBe('Am depus acordul');
  });
});
