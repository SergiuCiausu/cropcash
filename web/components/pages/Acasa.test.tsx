// @vitest-environment happy-dom
/* Acasă's crop tabs: the whole farm with its crops listed, and one crop in place of the account. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mode } from '../../lib/paths';
import { showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

/* Each test draws the whole frame and plan, which can be slow on a busy machine. */
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const main = () => within(document.querySelector('main')!);
const tab = (name: RegExp) => within(document.querySelector<HTMLElement>('.crop-tabs')!).getByRole('button', { name });
const cases: [string, Mode, Record<string, string>, boolean][] = [
  ["Ion's farm", 'demo', {}, true],
  ['a signed-in farm', 'farm', SIGNED_IN, true],
  ['a signed-in farm, offline', 'farm', SIGNED_IN, false],
];

describe.each(cases)('Acasă on %s', (_, mode, saved, online) => {
  it('shows the salary and every crop on the whole farm', async () => {
    await showPage('acasa', mode, saved, online);
    expect(main().getByText('Salariul tău', { selector: '.eyebrow' })).toBeTruthy();
    expect(main().getByRole('heading', { name: 'Pe culturi' })).toBeTruthy();
    expect(main().getByRole('button', { name: 'Grâu' })).toBeTruthy();
    expect(main().getByRole('button', { name: 'Porumb' })).toBeTruthy();
    expect(document.querySelector('.crop-total')!.textContent).toMatch(/^Total/);
  });

  it('swaps the account for the crop, in place', async () => {
    await showPage('acasa', mode, saved, online);
    const frame = document.querySelector('.app');
    const address = location.href;
    await act(async () => fireEvent.click(tab(/^Porumb/)));
    expect(main().getByText('Ce rămâne din porumb')).toBeTruthy();
    expect(main().queryByText('Salariul tău', { selector: '.eyebrow' })).toBeNull();
    expect(main().queryByText('Bani la tine acum')).toBeNull();
    expect(main().queryByRole('heading', { name: 'Pe culturi' })).toBeNull();
    expect(document.querySelector('main')!.textContent).not.toMatch(/NaN|undefined|\[object Object\]/);
    expect(document.querySelector('.app')).toBe(frame);
    expect(location.href).toBe(address);
  });

  it('opens a crop from its row under the whole farm, and comes back', async () => {
    await showPage('acasa', mode, saved, online);
    await act(async () => fireEvent.click(main().getByRole('button', { name: 'Grâu' })));
    expect(main().getByText('Ce rămâne din grâu')).toBeTruthy();
    await act(async () => fireEvent.click(tab(/^Toată ferma/)));
    expect(main().getByRole('heading', { name: 'Pe culturi' })).toBeTruthy();
  });
});
