import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';

export function VerifyBadge() {
  return (
    <span className="verify" title={t('common.toVerifyHint')}>
      {t('common.toVerify')}
    </span>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="err">
      {children}
    </p>
  );
}

/** Native modal dialog (no browser alert/confirm). Closes on Escape and backdrop click. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="phead">
        <h2>{title}</h2>
        <button type="button" className="link" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      {children}
    </dialog>
  );
}
