// @vitest-environment happy-dom
/* One "Total | Pe hectar" choice for every results card (docs/per-ha-total-plan.md). */
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPage, SIGNED_IN } from './harness';

beforeAll(() => import('recharts'), 120_000);

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const switches = () => [...document.querySelectorAll('[role="group"][aria-label="Arată sumele"]')];
const pressed = () => switches().map((g) => g.querySelector('[aria-pressed="true"]')!.textContent);
const tile = (label: string) => [...document.querySelectorAll('.fc-keys > div')].find((d) => d.querySelector('span')?.textContent === label)!.querySelector('b')!.textContent!;
const cropCells = () => [...document.querySelectorAll('.crop-table td[data-l="Intră"]')].map((td) => td.textContent!);
const flipTo = async (word: string) => {
  const button = [...switches()[0]!.querySelectorAll('button')].find((b) => b.textContent === word)!;
  await act(async () => void fireEvent.click(button));
};

describe('Prognoză, total or per hectare', () => {
  it('starts on the total, then every card follows one flip', async () => {
    await showPage('prognoza', 'farm', SIGNED_IN);
    expect(switches().length).toBeGreaterThan(1);
    expect(pressed().every((w) => w === 'Total')).toBe(true);
    expect(cropCells().some((c) => c.endsWith('/ha'))).toBe(false);
    const lowest = tile('Cel mai jos');
    await flipTo('Pe hectar');
    expect(pressed().every((w) => w === 'Pe hectar')).toBe(true);
    expect(tile('Intră')).toMatch(/\/ha$/);
    expect(cropCells().every((c) => c.endsWith('/ha'))).toBe(true);
    /* A balance is money in the account, never per hectare. */
    expect(tile('Cel mai jos')).toBe(lowest);
  });

  it('keeps the choice for the next page', async () => {
    await showPage('prognoza', 'farm', SIGNED_IN);
    await flipTo('Pe hectar');
    cleanup();
    await showPage('subventii', 'farm', SIGNED_IN);
    expect(pressed().every((w) => w === 'Pe hectar')).toBe(true);
    expect(document.querySelector('.hero-card .amount')!.textContent).toMatch(/\/ha$/);
  });

  it("leaves Ion's example farm and a real farm their own choice", async () => {
    await showPage('prognoza', 'demo', {});
    await flipTo('Pe hectar');
    cleanup();
    await showPage('prognoza', 'farm', SIGNED_IN);
    expect(pressed().every((w) => w === 'Total')).toBe(true);
  });
});
