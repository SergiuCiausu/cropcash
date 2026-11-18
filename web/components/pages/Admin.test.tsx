// @vitest-environment happy-dom
/* The admin panel's page (docs/admin-panel-plan.md step 6): who sees it, editing into the draft with a
   reason, the preview, publishing, and what works offline. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WHEAT_COST = 'crops.crops[id=grau].cost_lei_per_ha.mean';
const wheat = loadData().crops.crops.find((c) => c.id === 'grau')!;
const copy = (admin: boolean, version = 0) => JSON.stringify({ version, overrides: [], admin, at: '2026-11-14T08:00:00Z' });
const ADMIN = { ...SIGNED_IN, 'cropcash-prediction-data': copy(true) };
const ANSWERS = {
  '/api/prediction-data': { version: 0, overrides: [], admin: true },
  '/api/admin/versions': { current: 0, versions: [] },
  '/api/admin/publish': { version: 1 },
};

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el));

/** Finds the wheat's mean cost with the search, and opens its editor. */
async function openWheatCost() {
  type(screen.getByLabelText('Caută o cifră'), 'cost mijlociu grâu');
  await click(screen.getByRole('button', { name: new RegExp(`^Schimbă: Cost pe hectar, mijlociu, ${wheat.name_ro}`) }));
}

describe('who sees the panel', () => {
  it('a signed-in farmer who is not an admin gets a short card and no link', async () => {
    await showPage('admin', 'farm', { ...SIGNED_IN, 'cropcash-prediction-data': copy(false) }, true, undefined, { '/api/prediction-data': { version: 0, overrides: [], admin: false } });
    expect(screen.getByText('Pagina asta e doar pentru administratori.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Administrare' })).toBeNull();
    expect(screen.queryByLabelText('Caută o cifră')).toBeNull();
  });

  it('an admin gets every group of figures and a link in the menu', async () => {
    await showPage('admin', 'farm', ADMIN, true, undefined, ANSWERS);
    expect(screen.getByRole('heading', { level: 1, name: 'Cifrele calculelor' })).toBeTruthy();
    for (const g of ['Culturi', 'Subvenții APIA', 'Pensie', 'Vreme']) expect(screen.getByRole('heading', { level: 2, name: g })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Administrare' })[0]!.getAttribute('href')).toBe('/admin');
    expect(screen.getByText('Nimic publicat încă. Se folosesc cifrele din surse.')).toBeTruthy();
  });

  it("Ion's farm never shows the link, even on a phone that holds an admin's copy", async () => {
    await showPage('acasa', 'demo', ADMIN);
    expect(screen.queryByRole('link', { name: 'Administrare' })).toBeNull();
  });
});

describe('a change', () => {
  it('needs a reason before it goes in the draft', async () => {
    const { store } = await showPage('admin', 'farm', ADMIN, true, undefined, ANSWERS);
    await openWheatCost();
    type(screen.getByLabelText(/^Cost pe hectar, mijlociu, lei\/ha/), String(wheat.cost_lei_per_ha.max));
    await click(screen.getByRole('button', { name: 'Pune în ciornă' }));
    expect(screen.getByText(/Scrie de unde vine cifra/)).toBeTruthy();
    expect(store.keyStore.getItem('cropcash-admin-draft')).toBeNull();
  });

  it('goes in the draft, is kept on the phone, shows the plan before and after, and is published as the whole set', async () => {
    const { store, live } = await showPage('admin', 'farm', ADMIN, true, undefined, ANSWERS);
    await openWheatCost();
    type(screen.getByLabelText(/^Cost pe hectar, mijlociu, lei\/ha/), String(wheat.cost_lei_per_ha.max));
    type(screen.getByLabelText('De unde vine cifra'), 'Agro-Info, nov. 2026');
    await click(screen.getByRole('button', { name: 'Pune în ciornă' }));

    const draft = within(screen.getByRole('heading', { name: 'Ce schimbi' }).closest('section')!);
    expect(draft.getByText(`${wheat.cost_lei_per_ha.max} lei/ha`)).toBeTruthy();
    expect(JSON.parse(store.keyStore.getItem('cropcash-admin-draft')!).edits[WHEAT_COST]).toEqual({ value: wheat.cost_lei_per_ha.max, reason: 'Agro-Info, nov. 2026' });

    expect(screen.getByRole('heading', { name: 'Cum arată salariul tău' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Cu ciorna' })).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Ferma lui Ion' }));
    expect(screen.getByRole('heading', { name: 'Cum arată salariul lui Ion' })).toBeTruthy();
    expect(document.querySelector('.adm-table tr.moved')).toBeTruthy();
    const chart = screen.getByRole('img', { name: /^Banii lună de lună, într-un an normal/ });
    expect(chart.getAttribute('aria-label')).toContain('Cu ciorna, cel mai jos:');
    expect(chart.getAttribute('aria-label')).not.toContain('Cele două linii sunt la fel.');
    expect(chart.querySelector('path.c-alt')!.getAttribute('d')).not.toBe(chart.querySelector('path.c-line')!.getAttribute('d'));

    const publish = screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    type(screen.getByLabelText('Ce s-a schimbat, pe scurt'), 'Costuri noi la grâu');
    expect(publish.disabled).toBe(false);
    await click(publish);

    const call = (live.api as ReturnType<typeof vi.fn>).mock.calls.find(([p]) => p === '/api/admin/publish')!;
    expect(call[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(call[1].body)).toEqual({
      baseVersion: 0,
      note: 'Costuri noi la grâu',
      overrides: [{ path: WHEAT_COST, value: wheat.cost_lei_per_ha.max, reason: 'Agro-Info, nov. 2026' }],
    });
    expect(store.keyStore.getItem('cropcash-admin-draft')).toBeNull();
  });

  it('that breaks the order of low, mean and high is refused before publishing, in Romanian', async () => {
    await showPage('admin', 'farm', ADMIN, true, undefined, ANSWERS);
    await openWheatCost();
    type(screen.getByLabelText(/^Cost pe hectar, mijlociu, lei\/ha/), String(wheat.cost_lei_per_ha.max + 100));
    type(screen.getByLabelText('De unde vine cifra'), 'Test');
    await click(screen.getByRole('button', { name: 'Pune în ciornă' }));
    expect(screen.getByText(/Cel mai mic, mijlociu și cel mai mare trebuie să urce în ordinea asta\./)).toBeTruthy();
    type(screen.getByLabelText('Ce s-a schimbat, pe scurt'), 'x');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('offline', () => {
  it('the figures and the draft work, publishing is off and says why, nothing is sent', async () => {
    const saved = { ...ADMIN, 'cropcash-admin-draft': JSON.stringify({ base: 0, edits: { [WHEAT_COST]: { value: wheat.cost_lei_per_ha.max, reason: 'Agro-Info' } } }) };
    const { live } = await showPage('admin', 'farm', saved, false, undefined, ANSWERS);
    expect(screen.getByText('Nu ai internet. Poți lucra la ciornă; o publici când revii online.')).toBeTruthy();
    type(screen.getByLabelText('Ce s-a schimbat, pe scurt'), 'Costuri noi');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Publicarea cere internet.').length).toBeGreaterThan(0);
    expect(screen.getByText('Istoricul se vede doar cu internet.')).toBeTruthy();
    expect((live.api as ReturnType<typeof vi.fn>).mock.calls.some(([p]) => String(p).startsWith('/api/admin'))).toBe(false);
  });
});
