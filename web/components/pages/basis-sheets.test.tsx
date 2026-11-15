// @vitest-environment happy-dom
/* Tonnes and own-crop figures typed in either unit on Recolte (docs/per-ha-total-plan.md). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPage, SIGNED_IN } from './harness';

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
const chip = (group: Element, word: string) => [...group.querySelectorAll('button')].find((b) => b.textContent === word)!;

describe('Ce ai strâns, per hectare', () => {
  it('saves tonnes typed per hectare as the total for the hectares above', async () => {
    const { live } = await showPage('recolte', 'farm', SIGNED_IN);
    await click(screen.getByRole('button', { name: 'Notează recolta' }));
    const sheet = document.querySelector('dialog[open] form')!;
    const crop = sheet.querySelector('fieldset')!;
    const ha = crop.querySelector<HTMLInputElement>('input')!; // Hectare
    fireEvent.change(ha, { target: { value: '10' } });
    await click(chip(crop.querySelector('.basis-switch')!, 'Tone/ha'));
    fireEvent.change(screen.getAllByLabelText('Câte tone ai strâns la hectarul recoltat?')[0]!, { target: { value: '5,5' } });
    expect(crop.textContent).toContain('Adică 5,5 t/ha × 10 ha = 55 t');
    await act(async () => void fireEvent.submit(sheet));
    await vi.waitFor(() => expect(JSON.stringify((live.write as ReturnType<typeof vi.fn>).mock.calls)).toContain('"tonnes":55'));
  });
});

describe('Altă cultură, per hectare', () => {
  it('keeps the switch off until there are hectares, then saves the total per hectare', async () => {
    history.replaceState(null, '', '#cultura');
    await showPage('recolte', 'farm', SIGNED_IN);
    await click(screen.getByRole('button', { name: 'Altă cultură' }));
    const costs = screen.getByRole('group', { name: 'Cheltuielile: total sau pe hectar' });
    expect(chip(costs, 'Total').disabled).toBe(true);
    expect(document.body.textContent).toContain('Scrie întâi hectarele.');
    fireEvent.change(screen.getByLabelText('Hectare'), { target: { value: '4' } });
    expect(chip(costs, 'Total').disabled).toBe(false);
    await click(chip(costs, 'Total'));
    expect(screen.getByText('Cheltuieli pe toată cultura, în lei')).toBeTruthy();
    const yields = screen.getByRole('group', { name: 'Producția: tone sau tone la hectar' });
    await click(chip(yields, 'Tone'));
    fireEvent.change(screen.getByLabelText('Tone, an normal'), { target: { value: '12' } });
    expect(document.body.textContent).toContain('Salvăm 3 t/ha × 4 ha = 12 t');
  });
});
