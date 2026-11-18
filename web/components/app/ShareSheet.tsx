'use client';
/* "Trimite familiei": the farmer reads the text first, then picks how it leaves the phone. The text
   is ready offline; sending depends on the app chosen. No account or new permission is involved. */
import { useState } from 'react';
import { canShareText, copyText, printText, shareText } from '../../lib/ui/share';
import { ErrorLine, Sheet } from './bits';

export function ShareSheet({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const close = () => {
    setOpen(false);
    setCopied(false);
    setError('');
  };
  const send = async () => {
    setError('');
    const result = await shareText(title, text);
    if (result === 'sent') close();
    if (result === 'failed') setError('Nu s-a putut trimite. Copiază textul și pune-l în mesaj.');
  };
  const copy = async () => {
    setError('');
    const ok = await copyText(text);
    setCopied(ok);
    if (!ok) setError('Nu s-a putut copia. Ține apăsat pe text ca să-l selectezi.');
  };
  return (
    <>
      <button type="button" className="btn btn-line" onClick={() => setOpen(true)}>
        Trimite familiei
      </button>
      <Sheet open={open} onClose={close} className="h-sheet" label={title}>
        {open && (
          <>
            <h2>{title}</h2>
            <p className="note">Asta se trimite, exact așa. Tu alegi cui.</p>
            <pre className="share-text">{text}</pre>
            <ErrorLine>{error}</ErrorLine>
            <div className="ob-actions">
              {canShareText() ? (
                <button type="button" className="btn btn-dark" onClick={() => void send()}>
                  Trimite
                </button>
              ) : (
                <button type="button" className="btn btn-dark" onClick={() => printText(text)}>
                  Tipărește
                </button>
              )}
              <button type="button" className="btn btn-line" onClick={() => void copy()}>
                {copied ? 'Am copiat' : 'Copiază'}
              </button>
              <button type="button" className="btn btn-line" onClick={close}>
                Închide
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
