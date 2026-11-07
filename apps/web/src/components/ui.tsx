import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { Icon } from './Icon';
import { PALETTES, tokens } from '../lib/palette';

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

/** Bottom sheet on phones, centred dialog on wide screens. Native <dialog>, no browser alerts. */
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
      <div className="sheet-grab">
        <i />
      </div>
      <div className="sheet-h">
        <h2>{title}</h2>
        <button type="button" className="linkbtn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      {children}
    </dialog>
  );
}

/** Colour palette picker (prototype's palette control). */
export function PaletteMenu({ value, onChange, up }: { value: string; onChange: (id: string) => void; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`pal${up ? ' up' : ''}`} ref={host}>
      <button
        type="button"
        className="pal-btn"
        aria-label={t('palette.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="pal-dot" />
      </button>
      {open && (
        <div className="pal-menu">
          <p>{t('palette.title')}</p>
          {PALETTES.map((p) => {
            const tk = tokens(p);
            return (
              <button
                key={p.id}
                type="button"
                className="pal-opt"
                aria-pressed={p.id === value}
                style={{ '--c1': p.v.a, '--c2': p.v.b, '--c3': tk.c } as React.CSSProperties}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
              >
                <i />
                <span>
                  {p.name}
                  <small>{p.note}</small>
                </span>
                <Icon name="check" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <span className="mark">
        <Icon name="sprout" />
      </span>
      <span>{t('app.name')}</span>
    </span>
  );
}
