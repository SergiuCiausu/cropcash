// @vitest-environment happy-dom
/* Every page drawn by React, on Ion's farm and on a signed-in farm, online and offline: it draws a
   heading, and no figure reads NaN or undefined. Each ported page joins REACT_PAGES (lib/ui/nav.ts). */
import { cleanup, screen } from '@testing-library/react';
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mode } from '../../lib/paths';
import { REACT_PAGES } from '../../lib/ui/nav';
import type { ScreenName } from '../../screens';
import { showPage, SIGNED_IN } from './harness';

/* The first chart on the page loads Recharts, which takes many seconds when the whole suite is running. */
beforeAll(() => import('recharts'), 120_000);

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cases: [string, Mode, Record<string, string>, boolean][] = [
  ["Ion's farm", 'demo', {}, true],
  ['a signed-in farm', 'farm', SIGNED_IN, true],
  ['a signed-in farm, offline', 'farm', SIGNED_IN, false],
];

describe.each(REACT_PAGES.map((p) => p.slice(1) as ScreenName))('%s', (name) => {
  it.each(cases)('draws for %s', async (_, mode, saved, online) => {
    await showPage(name, mode, saved, online);
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
    const text = document.querySelector('main')!.textContent!;
    expect(text).not.toMatch(/NaN|undefined|\[object Object\]/);
  });
});
