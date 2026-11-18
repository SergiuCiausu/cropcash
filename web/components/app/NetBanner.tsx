'use client';
/* Without internet (app.js netBanner()): the date the figures are from, a warning after a week,
   records waiting to be sent, and records the server turned down. Only for a signed-in farm. */
import { date } from '../../lib/cc/format';
import { useFarmState, useStore } from '../../lib/cc/react';
import { failedTries, pendingPlan, pendingRecords } from '../../lib/live/outbox';

/** docs/07-architecture.md §8: after a week the figures may be out of date. */
export const STALE_DAYS = 7;
/** Failed tries before the farmer is told; fewer is an ordinary bad moment. */
const RETRY_NOTE_AFTER = 3;
const isPlanSave = (name: string) => name === 'save_harvests' || name === 'update_farm';

export function netNotes({ online, copyAt, now, waiting, refused, planWaiting = false, tries = 0, refusedPlan = 0 }: { online: boolean; copyAt: string | null; now: number; waiting: number; refused: number; planWaiting?: boolean; tries?: number; refusedPlan?: number }) {
  const notes: { tone: '' | 'warn'; text: string; refused?: true }[] = [];
  const days = copyAt ? Math.floor((now - Date.parse(copyAt)) / 864e5) : 0;
  const stale = days >= STALE_DAYS;
  if (!online)
    notes.push({
      tone: stale ? 'warn' : '',
      text: `Fără internet. Datele sunt din ${copyAt ? date(copyAt.slice(0, 10), true) : 'ultima conectare'}.${stale ? ' Au mai mult de o săptămână, așa că cifrele pot fi depășite.' : ''}`,
    });
  if (planWaiting) notes.push({ tone: '', text: 'Schimbările din plan se trimit când ai internet. Până atunci, cifrele sunt provizorii.' });
  if (tries >= RETRY_NOTE_AFTER) notes.push({ tone: '', text: 'Nu am reușit încă să trimitem ce ai notat. Încercăm din nou singuri și nu se pierde nimic.' });
  if (refusedPlan) notes.push({ tone: 'warn', refused: true, text: 'O schimbare din plan n-a putut fi salvată, așa că nu apare în cifre. Fă-o din nou.' });
  if (waiting)
    notes.push({ tone: '', text: `${waiting === 1 ? 'O înregistrare se trimite' : `${waiting} înregistrări se trimit`} când ai internet. Cifrele o includ deja, așa că salariul e provizoriu până atunci.` });
  if (refused)
    notes.push({
      tone: 'warn',
      refused: true,
      text:
        refused === 1
          ? 'O înregistrare n-a fost primită de server, așa că nu apare în cifre. Noteaz-o din nou în Recolte.'
          : `${refused} înregistrări n-au fost primite de server, așa că nu apar în cifre. Notează-le din nou în Recolte.`,
    });
  return notes;
}

export function NetBanner() {
  const { farm, online } = useFarmState();
  const store = useStore();
  const notes = farm?.me ? netNotes({ online, copyAt: farm.copyAt, now: Date.now(), waiting: pendingRecords(farm.outbox), planWaiting: pendingPlan(farm.outbox), tries: failedTries(farm.outbox), refused: farm.refused.filter((i) => !isPlanSave(i.name)).length, refusedPlan: farm.refused.filter((i) => isPlanSave(i.name)).length }) : [];
  return (
    <div id="net-banner" role="status">
      {notes.map((n) => (
        <p key={n.text} className={`offline net-note${n.tone ? ` ${n.tone}` : ''}`}>
          {n.text}{' '}
          {n.refused && (
            <button type="button" className="h-quiet" onClick={() => store?.dismissRefused()}>
              Am înțeles
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
