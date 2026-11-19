// @vitest-environment happy-dom
/* „De raportat”: the diesel quarter, the deadlines ahead and the registers, from docs/data, with no
   call to the server, on Ion's farm and offline. */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
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
    expect(screen.getByRole('link', { name: 'Fă situația motorinei (PDF)' }).getAttribute('href')).toBe('/ferma-lui-ion/rapoarte#r-fuel-excise');
    expect(live.api).not.toHaveBeenCalled();
  });

  it('works offline on a signed-in farm', async () => {
    await showPage('de-raportat', 'farm', SIGNED_IN, false);
    expect(text()).toContain('Ce urmează');
    expect(text()).not.toMatch(/NaN|undefined/);
  });
});
