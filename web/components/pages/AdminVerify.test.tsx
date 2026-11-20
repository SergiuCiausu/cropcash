// @vitest-environment happy-dom
/* „De verificat” (docs/admin-verificari-plan.md steps 4–6): who sees it, the counts and filters, answering
   with a source, the hand-over to the files and to /admin's draft, and what works offline. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifyAnswer } from '../../../packages/shared/src/verify/index';
import { showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  window.history.replaceState(null, '', '/verificari');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const copy = (admin: boolean) => JSON.stringify({ version: 0, overrides: [], admin, at: '2026-11-20T08:00:00Z' });
const ADMIN = { ...SIGNED_IN, 'cropcash-prediction-data': copy(true) };
const SALARY_KEY = 'plan-params.json:salary_round_lei#status';

const answer = (over: Partial<VerifyAnswer> = {}): VerifyAnswer => ({
  id: 'a1',
  itemKey: SALARY_KEY,
  verdict: 'confirmed',
  sourceUrl: 'https://cropcash.ro/decizie',
  note: 'Decizia echipei din 20 nov',
  byEmail: 'ion@cropcash.test',
  at: '2026-11-20T09:00:00Z',
  ...over,
});
/** One answer per path, whatever the method: the list for GET, the saved answer for POST. */
const api = (saved: VerifyAnswer, list: VerifyAnswer[] = []) => ({
  '/api/prediction-data': { version: 0, overrides: [], admin: true },
  '/api/admin/verify/answers': { answers: list, answer: saved },
});

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el));

async function openSalaryRound() {
  type(screen.getByLabelText('Caută'), 'salary_round_lei');
  await click(screen.getByRole('button', { name: /salary_round_lei/ }));
}

describe('who sees it', () => {
  it('a farmer who is not an admin gets a short card', async () => {
    await showPage('verificari', 'farm', { ...SIGNED_IN, 'cropcash-prediction-data': copy(false) }, true, undefined, { '/api/prediction-data': { version: 0, overrides: [], admin: false } });
    expect(screen.getByText('Pagina asta e doar pentru administratori.')).toBeTruthy();
    expect(screen.queryByLabelText('Caută')).toBeNull();
  });
});

describe('the list', () => {
  it('shows the counts per level and filters from them, keeping the filter in the address', async () => {
    await showPage('verificari', 'farm', ADMIN, true, undefined, api(answer()));
    expect(screen.getByRole('heading', { level: 1, name: 'De verificat' })).toBeTruthy();
    const check = screen.getByRole('button', { name: /De verificat$/ });
    const n = Number(within(check).getByText(/^\d+$/).textContent);
    expect(n).toBeGreaterThan(100);
    await click(check);
    expect(window.location.search).toBe('?nivel=check');
    expect(screen.getByText(new RegExp(`^${n} din \\d+ elemente$`))).toBeTruthy();
  });

  it('finds a row by its path and opens it with the value in use and the answer form', async () => {
    await showPage('verificari', 'farm', ADMIN, true, undefined, api(answer()));
    await openSalaryRound();
    expect(window.location.search).toBe('?caut=salary_round_lei');
    expect(screen.getByText('Folosit acum')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ce ai găsit' })).toBeTruthy();
  });

  it('reads the open questions of the doc too', async () => {
    await showPage('verificari', 'farm', ADMIN, true, undefined, api(answer()));
    await click(screen.getByRole('button', { name: /Întrebare deschisă$/ }));
    expect(screen.getAllByText(/11-open-questions\.md · [ABCD]\./).length).toBeGreaterThan(20);
  });
});

describe('an answer', () => {
  it('needs an https source and a note before it is sent, then waits to go in the files', async () => {
    const { live } = await showPage('verificari', 'farm', ADMIN, true, undefined, api(answer()));
    await openSalaryRound();
    const save = screen.getByRole('button', { name: 'Salvează răspunsul' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    type(screen.getByLabelText('Linkul sursei oficiale'), 'http://cropcash.ro/decizie');
    type(screen.getByLabelText('Ce scrie în sursă'), 'Decizia echipei din 20 nov');
    expect(screen.getByText('Linkul trebuie să înceapă cu https://.')).toBeTruthy();
    expect(save.disabled).toBe(true);
    type(screen.getByLabelText('Linkul sursei oficiale'), 'https://cropcash.ro/decizie');
    expect(save.disabled).toBe(false);
    await click(save);

    const call = vi.mocked(live.api).mock.calls.find(([p, init]) => p === '/api/admin/verify/answers' && (init as { method?: string } | undefined)?.method === 'POST')!;
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({ itemKey: SALARY_KEY, verdict: 'confirmed', note: 'Decizia echipei din 20 nov', sourceUrl: 'https://cropcash.ro/decizie' });
    expect(screen.getAllByText('Confirmat · de pus în fișier').length).toBeGreaterThan(0);
    const hand = screen.getByRole('heading', { name: 'De pus în fișiere' }).closest('details')!;
    expect(hand.textContent).toContain('docs/data/plan-params.json → salary_round_lei');
    expect(hand.textContent).toContain('"status": "confirmat"');
  });

  it('that says a figure /admin uses is wrong goes into /admin’s draft on request', async () => {
    const wrong = answer({ verdict: 'wrong', newValue: 100, note: 'Rotunjim la 100 lei' });
    const { store } = await showPage('verificari', 'farm', ADMIN, true, undefined, api(wrong));
    await openSalaryRound();
    await click(screen.getByLabelText('Greșit, valoarea corectă e alta'));
    type(screen.getByLabelText(/^Valoarea corectă/), '100');
    type(screen.getByLabelText('Linkul sursei oficiale'), 'https://cropcash.ro/decizie');
    type(screen.getByLabelText('Ce scrie în sursă'), 'Rotunjim la 100 lei');
    await click(screen.getByRole('button', { name: 'Salvează răspunsul' }));
    await click(screen.getByRole('button', { name: 'Pune valoarea în ciorna de pe Cifrele calculelor' }));
    const draft = JSON.parse(store.keyStore.getItem('cropcash-admin-draft')!);
    expect(draft.edits['params.salary_round_lei.value']).toEqual({ value: 100, reason: 'Rotunjim la 100 lei (https://cropcash.ro/decizie)' });
    expect(screen.getByText(/E în ciorna de pe/)).toBeTruthy();
  });
});

describe('offline', () => {
  it('shows the last answers read and turns saving off, saying why', async () => {
    const saved = JSON.stringify({ answers: [answer()], at: '2026-11-19T10:00:00Z' });
    await showPage('verificari', 'farm', { ...ADMIN, 'cropcash-verify-answers': saved }, false);
    expect(screen.getByText(/răspunsuri citite pe 19 nov. 2026/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'De pus în fișiere' })).toBeTruthy();
    await openSalaryRound();
    expect((screen.getByRole('button', { name: 'Salvează răspunsul' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ca să salvăm răspunsul ai nevoie de internet.')).toBeTruthy();
  });
});
