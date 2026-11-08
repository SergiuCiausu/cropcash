// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exact } from '../../lib/cc/format';
import { viewFor } from '../../lib/cc/plan';
import { showPage } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
afterEach(cleanup);

describe('Salariu', () => {
  it("shows Ion's salary from his plan, and the other years on tap", async () => {
    const { store } = await showPage('salariu', 'demo');
    const plan = viewFor(store.getState().farm!, 'farm').farmPlan();
    expect(document.querySelector('.pay-hero .amount')!.textContent).toBe(`${exact(plan.monthlySalary)} lei pe lună`);
    expect(document.querySelector('.pay-hero .eyebrow')!.textContent).toMatch(/^An normal:/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /An slab/ })));
    expect(document.querySelector('.pay-hero .eyebrow')!.textContent).toMatch(/^An slab:/);
    expect(screen.getByText(/ca exemplu\.$/)).toBeTruthy();
  });

  it('opens the whole year', async () => {
    await showPage('salariu', 'demo');
    const before = document.querySelectorAll('.m-row').length;
    const more = screen.queryByRole('button', { name: 'Arată tot anul' });
    if (!more) return;
    await act(async () => fireEvent.click(more));
    expect(document.querySelectorAll('.m-row').length).toBeGreaterThanOrEqual(before);
    expect(screen.getByRole('button', { name: 'Arată mai puțin' })).toBeTruthy();
  });
});
