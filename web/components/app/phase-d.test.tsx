// @vitest-environment happy-dom
/* Reaching outside the app: installing it, a deadline in the phone's calendar, a summary for family
   (F-21, F-23, F-30). */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageKey } from '../../lib/paths';
import { installWay } from '../../lib/ui/install';
import { saveCalendarFile, shareText } from '../../lib/ui/share';
import { showPage, SIGNED_IN } from '../pages/harness';

beforeAll(() => import('recharts'), 120_000);
vi.setConfig({ testTimeout: 20_000 });
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function announceInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => undefined);
  act(() => {
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome }) }));
  });
  return prompt;
}
const TITLE = 'Pune CropCash pe ecranul telefonului';
/* Later tests in this file start with the announcement already used up or still waiting. */
const useUp = async () => {
  if (installWay() === 'prompt') {
    const { askToInstall } = await import('../../lib/ui/install');
    await askToInstall();
  }
};

describe('The install card', () => {
  beforeEach(useUp);

  it('asks the phone once, then goes away', async () => {
    await showPage('acasa', 'farm', SIGNED_IN);
    expect(screen.queryByText(TITLE)).toBeNull();
    const prompt = announceInstall();
    expect(screen.getByText(TITLE)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pune pe telefon' }));
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('stays away after "Nu acum"', async () => {
    announceInstall();
    await showPage('acasa', 'farm', SIGNED_IN);
    fireEvent.click(screen.getByRole('button', { name: 'Nu acum' }));
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(localStorage.getItem(storageKey('cropcash-install-dismissed', 'farm'))).toBe('1');
    cleanup();
    await showPage('acasa', 'farm', SIGNED_IN);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('is not offered on Ion’s farm', async () => {
    announceInstall();
    await showPage('acasa', 'demo');
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('writes the steps on an iPhone', async () => {
    vi.stubGlobal('navigator', Object.defineProperty(Object.create(navigator), 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }));
    await showPage('acasa', 'farm', SIGNED_IN);
    expect(screen.getByText(/Safari/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pune pe telefon' })).toBeNull();
  });

  it('is hidden once installed', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(installWay()).toBeNull();
  });
});

const openTask = () => {
  const row = screen.getAllByText(/Declarația Unică/)[0].closest('button')!;
  fireEvent.click(row);
  return within(document.querySelector<HTMLElement>('dialog.detail')!);
};

describe('The phone calendar', () => {
  it('makes the file without any internet, and says where it went', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    await showPage('calendar', 'demo', {}, false);
    const sheet = openTask();
    await act(async () => {
      fireEvent.click(sheet.getByRole('button', { name: 'Pune în calendarul telefonului' }));
    });
    expect(created).toHaveBeenCalledTimes(1);
    const file = created.mock.calls[0][0] as File;
    const ics = await file.text();
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('Declara');
    expect(ics).toContain('TRIGGER:-P');
    expect(sheet.getByText(/Deschide-l/)).toBeTruthy();
  });

  it('isn’t offered for money that just arrives', async () => {
    await showPage('calendar', 'demo');
    fireEvent.click(screen.getAllByText('Avansul de la APIA').at(-1)!.closest('button')!);
    expect(within(document.querySelector<HTMLElement>('dialog.detail')!).queryByRole('button', { name: 'Pune în calendarul telefonului' })).toBeNull();
  });

  it('uses the share menu when the phone takes files', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share }));
    expect(await saveCalendarFile('a.ics', 'x', 't')).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('does nothing more when the farmer backs out of the menu', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) }));
    expect(await saveCalendarFile('a.ics', 'x', 't')).toBe('cancelled');
  });
});

describe('Sending to family', () => {
  const openShare = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Trimite familiei' }));
    return document.querySelector('.share-text')!.textContent!;
  };

  it('shows the salary text before sending, with what the page shows', async () => {
    await showPage('salariu', 'demo');
    const amount = document.querySelector('.pay-hero .amount')!.textContent!.replace(' pe lună', '');
    const text = openShare();
    expect(text).toContain(`${amount} pe lună`);
    expect(text).toContain('Următorii bani:');
    expect(text).toContain('Pe ce se bazează:');
  });

  it('sends that same text', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share }));
    await showPage('salariu', 'demo');
    const text = openShare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text }));
    expect(document.querySelector('.share-text')).toBeNull();
  });

  it('offers the printer where there is no share menu, and works offline', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: undefined }));
    const print = vi.fn();
    Object.assign(window, { print });
    await showPage('subventii', 'demo', {}, false);
    const text = openShare();
    expect(text).toContain('Subvenția APIA');
    expect(text).toContain('Avansul:');
    fireEvent.click(screen.getByRole('button', { name: 'Tipărește' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.getElementById('print-share')!.textContent).toBe(text);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('print-share')).toBeNull();
  });

  it('tells the farmer when sending fails', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: () => Promise.reject(new Error('no')) }));
    expect(await shareText('t', 'x')).toBe('failed');
  });
});
