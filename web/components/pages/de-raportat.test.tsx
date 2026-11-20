// @vitest-environment happy-dom
/* „De raportat”: the diesel quarter, the deadlines ahead and the registers, from docs/data, with no
   call to the server, on Ion's farm and offline. */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPage, SIGNED_IN } from './harness';

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

const text = () => document.querySelector('main')!.textContent!;

describe('De raportat', () => {
  it("shows Ion's diesel quarter, what to bring, and the deadlines ahead, without asking the server", async () => {
    const { live } = await showPage('de-raportat', 'demo');
    expect(screen.getByRole('heading', { level: 1, name: 'De raportat' })).toBeTruthy();
    expect(text()).toContain('Motorina, trimestrul IV din 2026');
    expect(text()).toContain('Situația centralizatoare a cantităților de motorină');
    // the claim for this quarter, and the yearly deadlines at the primărie
    expect(text()).toContain('Ceri banii înapoi pe motorina din trimestrul IV');
    expect(text()).toContain('Declari la primărie familia, terenul, utilajele și animalele');
    // the 2027 acord isn't announced: marked as still to check
    expect(text()).toContain('dacă APIA prelungește ajutorul');
    expect(text()).toContain('Registrul tratamentelor cu pesticide');
    expect(text()).toContain('Dacă ai și animale');
    expect(live.api).not.toHaveBeenCalled();
  });

  it('opens the diesel report in a sheet on the page, with a link to all the reports', async () => {
    await showPage('de-raportat', 'demo');
    fireEvent.click(screen.getByRole('button', { name: 'Fă situația motorinei (PDF)' }));
    const sheet = screen.getByRole('dialog', { name: 'Motorina și acciza de recuperat' });
    expect(within(sheet).getByRole('button', { name: 'Descarcă PDF' })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: 'Toate rapoartele' }).getAttribute('href')).toBe('/ferma-lui-ion/rapoarte#r-fuel-excise');
    expect(location.pathname).not.toContain('/rapoarte');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).toBeNull();
  });

  it('opens a register from "Ce ții scris tot anul" in the sheet', async () => {
    await showPage('de-raportat', 'demo');
    fireEvent.click(screen.getAllByRole('button', { name: 'Îl faci din Rapoarte' })[0]!);
    expect(screen.getByRole('dialog', { name: 'Registrul tratamentelor' })).toBeTruthy();
  });

  it('works offline on a signed-in farm', async () => {
    await showPage('de-raportat', 'farm', SIGNED_IN, false);
    expect(text()).toContain('Ce urmează');
    expect(text()).not.toMatch(/NaN|undefined/);
  });
});
