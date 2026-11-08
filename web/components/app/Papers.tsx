'use client';
/* Reading a paper the farmer uploads (was web/legacy/papers.js). Every paper button goes through here.
   The file goes to the API once and is kept nowhere. The page gets the fields back and fills in a form,
   or asks in a sheet, so nothing is saved until the farmer taps. Reading needs internet, so offline the
   button is off and typing by hand still works. Nothing here moves money.

   <PapersProvider> holds the one sheet; usePapers() gives pick(), tell() and confirmDecision(), which
   resolve when the farmer answers, as the legacy Papers did. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseLeiText } from '../../../packages/shared/src/documents/index';
import { cents } from '../../lib/cc/format';
import { FAIL_TEXT } from '../../lib/live/fail-text';
import { useSheetHistory } from './bits';
import { useFarm, useFarmState, useStore } from '../../lib/cc/react';
import type { PaperReading } from '../../lib/cc/store';
import { pageKeys } from '../../lib/cc/storage';
import { FrameContext } from './context';
import { ErrorLine } from './bits';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const JPEG_QUALITY = 0.8;
export const PAPER_OFFLINE = 'Ca să citim hârtia ai nevoie de internet. Poți scrie și de mână.';
const ERRORS: Record<string, string> = {
  too_many_reads: 'Ai citit multe hârtii azi. Încearcă mâine sau scrie de mână.',
  too_large: 'Hârtia e prea mare. Fă câte o poză la fiecare pagină.',
  too_many: 'Sunt prea multe pagini pentru o singură hârtie.',
  bad_file: 'Nu putem deschide fișierul. Merge o poză sau un PDF.',
  /* The paper is fine here, so asking for a clearer photo would only waste the farmer's time. */
  read_failed: 'Acum nu putem citi hârtii. Încearcă mai târziu sau scrie de mână.',
  reader_off: 'Acum nu putem citi hârtii. Încearcă mai târziu sau scrie de mână.',
  offline: PAPER_OFFLINE,
  network: PAPER_OFFLINE,
};
const SEEN: Record<string, string> = {
  invoice: 'Asta pare o factură. O poți nota la Recolte.',
  sale_paper: 'Asta pare o hârtie de vânzare. O poți nota la Recolte.',
  apia_cerere: 'Asta pare cererea de la APIA, nu decizia de plată.',
  apia_decizie: 'Asta pare o decizie APIA. O poți pune la Subvenții.',
  other: 'Nu am putut citi hârtia. Fă o poză mai clară, cu toată foaia în cadru, sau scrie de mână.',
};

type File64 = { mediaType: string; data: string; bytes: number };
type Sheet =
  | { kind: 'ask'; title: string; text: string; buttons: [string, string][]; done: (v: string) => void }
  | { kind: 'wait' }
  | { kind: 'decision'; campaign: number; reading: PaperReading; effect?: (bani: number) => string; done: (v: number | null) => void };

const dataOf = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).split(',')[1]);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });

/* A phone photo is several megabytes, too much for a weak signal, and text stays readable smaller. */
async function prepare(file: File, side: number): Promise<File64> {
  if (file.type === 'application/pdf') return { mediaType: file.type, data: await dataOf(file), bytes: file.size };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/jpeg', JPEG_QUALITY));
  return { mediaType: 'image/jpeg', data: await dataOf(blob), bytes: blob.size };
}

/* A file input without "capture" offers both the camera and the files, so one button is enough. */
function chooseFiles(multiple: boolean) {
  return new Promise<File[]>((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = multiple;
    input.hidden = true;
    const finish = (files: File[]) => {
      input.remove();
      done(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

interface PapersApi {
  pick(o: { accepts: PaperReading['kind'][]; pages?: boolean }): Promise<PaperReading | null>;
  tell(title: string, text: string): Promise<string>;
  confirmDecision(reading: PaperReading, effect?: (bani: number) => string): Promise<number | null>;
}
const PapersContext = createContext<PapersApi | null>(null);
export const usePapers = () => useContext(PapersContext)!;

export function PapersProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const farm = useFarm();
  const { mode } = useContext(FrameContext);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const limits = farm?.farmData.params.documents;

  const ask = useCallback((title: string, text: string, buttons: [string, string][]) => new Promise<string>((done) => setSheet({ kind: 'ask', title, text, buttons, done })), []);
  const tell = useCallback((title: string, text: string) => ask(title, text, [['ok', 'Închide']]), [ask]);

  const api = useRef<PapersApi>(null as never);
  api.current = {
    tell,
    async pick({ accepts, pages = false }) {
      if (!store || !limits) return null;
      /* Asked once per phone: the paper goes to an AI reader. */
      const asked = pageKeys(mode).paperOk;
      let ok = false;
      try {
        ok = !!localStorage.getItem(asked);
      } catch {
        /* asks every time */
      }
      if (!ok) {
        const answer = await ask('Citim hârtia cu un program AI', 'Hârtia ajunge la serviciul care o citește și poate avea numele, CNP-ul sau contul tău. Păstrăm doar cifrele pe care le confirmi tu, nu și hârtia.', [
          ['yes', 'Bine așa'],
          ['no', 'Renunță'],
        ]);
        if (answer !== 'yes') return null;
        try {
          localStorage.setItem(asked, '1');
        } catch {
          /* asks again next time */
        }
      }
      /* A long paper in photos comes page by page, because the camera takes one at a time. */
      const files: File64[] = [];
      try {
        for (;;) {
          for (const f of await chooseFiles(pages)) files.push(await prepare(f, limits.photo_long_side_px.value));
          if (!files.length || files.some((f) => f.mediaType === 'application/pdf') || !pages || files.length >= limits.max_pages.value) break;
          const more = await ask(files.length === 1 ? 'Ai o pagină' : `Ai ${files.length} pagini`, 'Dacă hârtia are mai multe pagini, adaugă-le pe toate.', [
            ['read', 'Citește hârtia'],
            ['more', 'Mai adaug o pagină'],
            ['stop', 'Renunță'],
          ]);
          if (more === 'stop') return null;
          if (more === 'read') break;
        }
      } catch {
        await tell('Nu am putut citi hârtia', ERRORS.bad_file);
        return null;
      }
      if (!files.length) return null;
      if (files.reduce((s, f) => s + f.bytes, 0) > limits.max_mb.value * 1024 * 1024) {
        await tell('Nu am putut citi hârtia', ERRORS.too_large);
        return null;
      }
      setSheet({ kind: 'wait' });
      let reading: PaperReading | null = null;
      let problem: string | null = null;
      try {
        reading = await store.readDocument(files.map(({ mediaType, data }) => ({ mediaType, data })));
        if (!accepts.includes(reading.kind)) problem = SEEN[reading.kind];
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        problem = ERRORS[code] ?? (code === 'timeout' ? FAIL_TEXT.timeout.paper : SEEN.other);
      }
      setSheet(null);
      if (!problem) return reading;
      await tell('Nu am putut folosi hârtia', problem);
      return null;
    },
    confirmDecision(reading, effect) {
      const campaign = farm!.farmData.subsidies.meta.campaign_year;
      if (reading.year && reading.year !== campaign) return tell(`Decizia e pentru ${reading.year}`, `Planul tău e pentru ${campaign}, așa că nu folosim suma de pe ea.`).then(() => null);
      return new Promise((done) => setSheet({ kind: 'decision', campaign, reading, effect, done }));
    },
  };
  const stable = useRef<PapersApi>({
    pick: (o) => api.current.pick(o),
    tell: (t, x) => api.current.tell(t, x),
    confirmDecision: (r, e) => api.current.confirmDecision(r, e),
  });

  return (
    <PapersContext.Provider value={stable.current}>
      {children}
      <PaperSheet sheet={sheet} close={() => setSheet(null)} />
    </PapersContext.Provider>
  );
}

function PaperSheet({ sheet, close }: { sheet: Sheet | null; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal?.();
    if (!sheet && d.open) d.close();
    if (sheet?.kind === 'decision') {
      setAmount(sheet.reading.amountBani ? cents(sheet.reading.amountBani) : '');
      setError(false);
    }
  }, [sheet]);

  const finish = (v: string | number | null) => {
    close();
    if (sheet?.kind === 'ask') sheet.done(v as string);
    if (sheet?.kind === 'decision') sheet.done(v as number | null);
  };
  /* Escape and Back count as the last button; the "reading" sheet can't be closed. */
  const onCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (sheet?.kind === 'ask') finish(sheet.buttons[sheet.buttons.length - 1][0]);
    if (sheet?.kind === 'decision') finish(null);
  };
  const bani = parseLeiText(amount);
  useSheetHistory(!!sheet, () => {
    if (sheet?.kind === 'ask') finish(sheet.buttons[sheet.buttons.length - 1][0]);
    if (sheet?.kind === 'decision') finish(null);
  }, sheet?.kind === 'wait');

  return (
    <dialog ref={ref} className="h-sheet paper-sheet" aria-labelledby="paper-title" onCancel={onCancel}>
      {sheet?.kind === 'wait' && (
        <>
          <h2 id="paper-title">Citesc hârtia…</h2>
          <p className="note" role="status">
            Durează câteva secunde. Nu închide pagina.
          </p>
        </>
      )}
      {sheet?.kind === 'ask' && (
        <>
          <h2 id="paper-title">{sheet.title}</h2>
          <p className="note">{sheet.text}</p>
          <div className="ob-actions">
            {sheet.buttons.map(([value, label], i) => (
              <button key={value} type="button" className={`btn ${i ? 'btn-line' : 'btn-dark'}`} onClick={() => finish(value)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {sheet?.kind === 'decision' && (
        <>
          <h2 id="paper-title">Ce am citit</h2>
          <p className="note">
            {sheet.reading.amountBani ? 'Verifică suma cu cea de pe hârtie.' : 'Nu am găsit suma totală. Scrie-o de pe hârtie.'} Să fie suma pentru tot anul {sheet.campaign}, nu doar avansul.
          </p>
          <label className="ob-field">
            Suma aprobată, în lei
            <input value={amount} inputMode="decimal" autoComplete="off" onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="note paper-effect" aria-live="polite">
            {bani && sheet.effect ? sheet.effect(bani) : ''}
          </p>
          {error && <ErrorLine>Scrie suma ca număr, de exemplu 16.900,50.</ErrorLine>}
          <div className="ob-actions">
            <button type="button" className="btn btn-dark" onClick={() => (bani ? finish(bani) : setError(true))}>
              Bine așa
            </button>
            <button type="button" className="btn btn-line" onClick={() => finish(null)}>
              Renunță
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

/** The paper button. Ion's farm offers an account instead; offline it turns off and says why. */
export function PaperButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { farm, online } = useFarmState();
  if (farm?.mode === 'demo' || !farm?.signedIn)
    return (
      <a className="btn btn-line paper-btn" href="/login?mode=register">
        Fă-ți cont ca să încarci hârtia
      </a>
    );
  return (
    <>
      <button type="button" className="btn btn-line paper-btn" disabled={!online} data-needs-net={PAPER_OFFLINE} onClick={onClick}>
        {label}
      </button>
      {!online && <p className="note paper-off">{PAPER_OFFLINE}</p>}
    </>
  );
}
