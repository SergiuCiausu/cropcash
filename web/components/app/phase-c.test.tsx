// @vitest-environment happy-dom
/* The bell, the demo strip, moving between the money pages, leaving the account, honest labels,
   tappable rows and Ion's sample assistant (F-07, F-09, F-10, F-15, F-16, F-17, F-18, F-22). */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_QUESTIONS } from '../../lib/ui/demo-assistant';
import { showPage, SIGNED_IN } from '../pages/harness';

beforeAll(() => import('recharts'), 120_000);

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('The bell', () => {
  it('opens messages on a real farm, with no test buttons', async () => {
    await showPage('salariu', 'farm', SIGNED_IN);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mesaje' })[0]);
    const panel = document.getElementById('ntf-panel')!;
    expect(within(panel).queryByRole('button', { name: 'Trimite' })).toBeNull();
    expect(panel.textContent).not.toMatch(/Au intrat|Plata salariului|Am scăzut salariul/);
  });

  it('keeps the test panel on Ion’s farm', async () => {
    await showPage('salariu', 'demo');
    expect(screen.getAllByRole('button', { name: 'Probează notificările' }).length).toBeGreaterThan(0);
  });
});

describe('Ion’s strip', () => {
  it('shrinks after the first page', async () => {
    await showPage('salariu', 'demo');
    expect(document.querySelector('.demo-strip.compact')).toBeNull();
    cleanup();
    await showPage('salariu', 'demo');
    expect(document.querySelector('.demo-strip.compact')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fă-ți cont' })).toBeTruthy();
  });
});

describe('The money pages', () => {
  it.each(['salariu', 'pensie', 'bani'] as const)('link to each other from %s', async (name) => {
    await showPage(name, 'farm', SIGNED_IN);
    const nav = screen.getByRole('navigation', { name: 'Salariu' });
    expect(within(nav).getByRole('link', { name: 'Pensie' }).getAttribute('href')).toBe('/pensie');
    expect(within(nav).getByRole('link', { name: 'Contul tău' }).getAttribute('href')).toBe('/bani');
  });
});

describe('Leaving the account', () => {
  it('asks first', async () => {
    await showPage('bani', 'farm', SIGNED_IN);
    expect(document.querySelector('dialog[open]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ieși din cont' }));
    expect(screen.getByText('Ca să intri din nou îți trebuie parola.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Da, ies din cont' }).getAttribute('href')).toBe('/login?signout=1');
  });
});

describe('Honest labels', () => {
  it('says when the salary comes from averages', async () => {
    await showPage('salariu', 'farm', SIGNED_IN);
    expect(screen.getByText(/Calculat cu mediile/)).toBeTruthy();
    expect(screen.queryByText(/poți scoate sigur/)).toBeNull();
  });

  it('says the assistant is a program', async () => {
    await showPage('salariu', 'farm', SIGNED_IN);
    await act(async () => {
      fireEvent.click(document.querySelector('.ask-fab')!);
    });
    expect(screen.getByText(/inteligență artificială/)).toBeTruthy();
  });
});

describe('Acasă', () => {
  it('opens what comes next, in a sheet', async () => {
    await showPage('acasa', 'demo');
    const row = document.querySelector<HTMLButtonElement>('button.ac-row')!;
    const title = row.querySelector('b')!.textContent!;
    fireEvent.click(row);
    expect(within(document.querySelector<HTMLElement>('dialog.detail')!).getByRole('heading', { name: title })).toBeTruthy();
  });
});

describe('Ion’s assistant', () => {
  it('answers from his plan, and never asks the server', async () => {
    const { live } = await showPage('salariu', 'demo');
    await act(async () => {
      fireEvent.click(document.querySelector('.ask-fab')!);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cât poate scoate Ion pe lună?' }));
    });
    expect(screen.getByText('Exemplu de răspuns.', { exact: false })).toBeTruthy();
    expect(document.querySelector('.ask-card, [class*="ask-card"]')).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('dialog.ask-sheet')!).getByRole('link', { name: 'Fă-ți cont' })).toBeTruthy();
    expect(live.api).not.toHaveBeenCalled();
  });

  it.each(DEMO_QUESTIONS.map((q) => q.question))('shows a card for “%s”', async (question) => {
    await showPage('salariu', 'demo');
    await act(async () => {
      fireEvent.click(document.querySelector('.ask-fab')!);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: question }));
    });
    expect(document.querySelector('[class*="ask-card"]')).toBeTruthy();
  });
});
