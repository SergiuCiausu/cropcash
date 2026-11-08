// @vitest-environment happy-dom
/* What may close a sheet (F-02, F-19): never one where money is moving, and not a form on a stray tap. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './bits';
import { showPage, ME, SIGNED_IN } from '../pages/harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  history.replaceState(null, '');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dialog = () => document.querySelector('dialog')!;
const show = (props: { locked?: boolean; keepOnBackdrop?: boolean } = {}) => {
  const onClose = vi.fn();
  const view = render(
    <Sheet open onClose={onClose} className="h-sheet" label="Test" {...props}>
      <p>Conținut</p>
    </Sheet>,
  );
  return { onClose, ...view };
};
/* What the browser does on Back: the entry the sheet added is gone. */
const pressBack = () => {
  history.replaceState(null, '');
  dispatchEvent(new PopStateEvent('popstate'));
};

describe('Sheet', () => {
  it('closes on a tap beside it', () => {
    const { onClose } = show();
    fireEvent.click(dialog());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a form open on a tap beside it', () => {
    const { onClose } = show({ keepOnBackdrop: true });
    fireEvent.click(dialog());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Back, and leaves the history alone', () => {
    const back = vi.spyOn(history, 'back');
    const { onClose } = show();
    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('removes its history entry when closed another way', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const { unmount } = show();
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('keeps the rest of history.state, which the router needs', () => {
    history.replaceState({ __NA: true }, '');
    show();
    expect(history.state).toMatchObject({ __NA: true, ccSheet: expect.any(Number) });
  });

  it('stays open when locked, whatever is tried', () => {
    const { onClose } = show({ locked: true });
    fireEvent.click(dialog());
    pressBack();
    expect(onClose).not.toHaveBeenCalled();
    expect(history.state?.ccSheet).toEqual(expect.any(Number));
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent(dialog(), new Event('close'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Starting a pension', () => {
  it('cannot be dismissed while the request runs', async () => {
    const me = { ...ME, stripe_account_id: 'acct_1' };
    const { live } = await showPage('pensie', 'farm', { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) }, true, me);
    (live.write as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Pornesc' }));
    const sheet = document.querySelector<HTMLDialogElement>('dialog.h-sheet[open]')!;
    const [yes, no] = sheet.querySelectorAll<HTMLButtonElement>('.ob-actions button');
    expect(yes.textContent).toMatch(/^Da, pornesc cu /);
    expect(no.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(yes);
    });
    expect(live.write).toHaveBeenCalled();
    expect(no.disabled).toBe(true);
    fireEvent.click(sheet);
    expect(document.querySelector('dialog.h-sheet[open] .ob-actions')).toBeTruthy();
  });
});
