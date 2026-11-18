'use client';
/* Small shared pieces of the React frame: icons, amounts, buttons that need internet, offline notes
   and the <dialog> sheet. Each keeps the class names and texts the legacy pages use. */
import { useContext, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { group } from '../../lib/cc/format';
import { useMoney, useOnline } from '../../lib/cc/react';
import { ICONS, type IconName } from '../../lib/ui/icons';
import { FrameContext } from './context';

export function Icon({ name }: { name: IconName }) {
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

export const CHEVRON = (
  <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** "de verificat": a figure from a DE-VERIFICAT source. */
export const Verify = () => <span className="tag v">de verificat</span>;

/** An amount in bani, in the farmer's currency. `as`: exact to the leu (default), rounded to 100, with cents, or with its sign. */
export function Money({ bani, as = 'lei' }: { bani: number; as?: 'lei' | 'about' | 'cents' | 'signed' }) {
  const money = useMoney();
  return <>{money[as](bani)}</>;
}

/**
 * A button that needs the internet (docs/07-architecture.md §8). Offline it turns off and says why
 * underneath, as `data-needs-net` buttons do on the legacy pages. Its own `disabled` stays as given.
 */
export function NetButton({ reason, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { reason: string }) {
  const online = useOnline();
  return (
    <>
      <button type="button" {...rest} data-needs-net={reason} disabled={disabled || !online} />
      {!online && <small className="net-why">{reason}</small>}
    </>
  );
}

/** A message about what just went wrong, read out as soon as it appears. Nothing when there's no message. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return children ? (
    <p className="ob-err" role="alert">
      {children}
    </p>
  ) : null;
}

/** Under a lei field: the amount as the app read it, so a wrong reading shows before it's saved. */
export function AmountEcho({ text }: { text: string }) {
  const lei = parseWholeLei(text);
  return (
    <small className="amount-echo" aria-live="polite">
      {lei ? `Adică ${group(lei)} lei` : ''}
    </small>
  );
}

/** A note shown only without internet: what this page still does offline. */
export function OfflineNote({ children }: { children: ReactNode }) {
  return useOnline() ? null : <p className="offline">{children}</p>;
}

let nextSheet = 0;

/**
 * The phone's Back closes an open sheet instead of leaving the page. Opening adds a history entry, and
 * closing any other way removes it. history.state is spread because the Next.js router keeps its own
 * there. Newer Chrome closes a modal on Back by itself, with no history step; the entry is removed the same way.
 */
export function useSheetHistory(open: boolean, onBack: () => void, locked = false) {
  const latest = useRef({ onBack, locked });
  latest.current = { onBack, locked };
  useEffect(() => {
    if (!open) return;
    const mark = ++nextSheet;
    const push = () => history.pushState({ ...history.state, ccSheet: mark }, '');
    let wentBack = false;
    push();
    const onPop = () => {
      /* Back from a sheet opened on top of this one lands here, and this one stays. */
      if (history.state?.ccSheet === mark) return;
      if (latest.current.locked) return push();
      wentBack = true;
      latest.current.onBack();
    };
    addEventListener('popstate', onPop);
    return () => {
      removeEventListener('popstate', onPop);
      if (!wentBack && history.state?.ccSheet === mark) history.back();
    };
  }, [open]);
}

/**
 * A <dialog> opened as a modal while `open`; a tap on the backdrop, Escape or Back closes it.
 * `locked`: nothing closes it, for while money is moving and the answer has to be seen.
 * `keepOnBackdrop`: a stray tap beside a form doesn't throw away what was typed.
 */
export function Sheet({ open, onClose, className, label, locked = false, keepOnBackdrop = false, children }: { open: boolean; onClose: () => void; className: string; label: string; locked?: boolean; keepOnBackdrop?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useSheetHistory(open, onClose, locked);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        if (locked) e.preventDefault();
      }}
      onClose={(e) => {
        /* Browsers let a second Escape or Back through even when the first was refused. */
        if (locked && open) e.currentTarget.showModal?.();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked && !keepOnBackdrop) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

/** A link to another app page, kept on Ion's farm when the visitor is there. */
export function useHref() {
  return useContext(FrameContext).href;
}
