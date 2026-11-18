'use client';
/* What a farmer's own event says and what can be done with one of its dates: tick it, answer
   „Ai plătit?”, change it, delete it, put it in the phone's calendar. All of it works offline on a
   farm with an account (the queue) and on Ion's farm (on the phone). */
import { useState } from 'react';
import { addDays, occurrences, type EditScope, type Occurrence, type StoredEvent } from '../../../packages/shared/src/calendar/events';
import { buildIcs } from '../../../packages/shared/src/calendar/ics';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { date, exact, failText } from '../../lib/cc/format';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { expenseLabel } from '../../lib/ui/categories';
import { saveCalendarFile } from '../../lib/ui/share';
import { ErrorLine } from './bits';
import { CATEGORY_WORDS, SCOPES } from './EventSheet';
import '../../styles/events.css';

/** The occurrence a calendar row stands for. */
export function findOccurrence(events: readonly StoredEvent[], eventId: string, originalDate: string): Occurrence | null {
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return null;
  const rows = ev.farm_event_occurrences ?? [];
  const moved = rows.find((r) => r.original_date === originalDate)?.moved_to;
  const day = moved ?? originalDate;
  const span = ev.ends_on ? Math.max(0, (Date.parse(ev.ends_on) - Date.parse(ev.starts_on)) / 86_400_000) : 0;
  return occurrences(ev, addDays(day, -span), day).find((o) => o.originalDate === originalDate) ?? null;
}

const repeatWord = (e: StoredEvent) =>
  e.repeat === 'monthly' ? `În fiecare lună${e.repeat_until ? `, până pe ${date(e.repeat_until, true)}` : ''}` : e.repeat === 'yearly' ? `În fiecare an${e.repeat_until ? `, până în ${e.repeat_until.slice(0, 4)}` : ''}` : null;

/** The facts the sheet shows for a farmer's own event. */
export function EventFacts({ occ }: { occ: Occurrence }) {
  const view = useView('farm')!;
  const e = occ.event;
  const tags = [
    CATEGORY_WORDS[e.category],
    e.crop_id ? view.cropName(e.crop_id) : null,
    e.category === 'money' && e.direction === 'out' ? expenseLabel(e.expense_category) : null,
    repeatWord(e),
    e.remind_days_before != null ? (e.remind_days_before === 0 ? 'Îți amintesc în ziua aceea' : `Îți amintesc cu ${e.remind_days_before === 1 ? 'o zi' : `${e.remind_days_before} zile`} înainte`) : null,
    occ.atTime ? `La ${occ.atTime}` : null,
    occ.changed ? 'Schimbat doar în ziua asta' : null,
  ].filter(Boolean) as string[];
  return (
    <>
      <div className="ev-meta">
        {tags.map((x) => (
          <span key={x} className="tag">
            {x}
          </span>
        ))}
      </div>
      {e.category === 'money' && (
        <p className="d-text">
          {e.replaces_estimate
            ? 'E suma ta, pusă în locul estimării. Planul și salariul socotesc cu ea.'
            : e.direction === 'in'
              ? 'E suma ta. Se adaugă la ce intră în plan, iar salariul socotește cu ea.'
              : 'E suma ta. Se adaugă la ce iese din plan, iar salariul socotește cu ea.'}
        </p>
      )}
      {occ.endDate !== occ.date && <p className="d-text">Până pe {date(occ.endDate, true)}.</p>}
      {occ.note && <p className="d-text">{occ.note}</p>}
    </>
  );
}

export function EventActions({ occ, onDone, onEdit }: { occ: Occurrence; onDone: () => void; onEdit: (event: StoredEvent, originalDate: string) => void }) {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const view = useView('farm')!;
  const { text: t } = useMoney();
  const today = view.today;
  const e = occ.event;
  const money = e.category === 'money' && !!e.direction;
  const series = e.repeat !== 'none';
  const ask = money && !occ.done && occ.date <= today;
  const [amount, setAmount] = useState(occ.amount != null ? String(Math.round(occ.amount / 100)) : '');
  const [day, setDay] = useState(occ.date <= today ? occ.date : today);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const run = async (name: string, input: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await store.eventWrite(name as never, input);
      setBusy(false);
      onDone();
    } catch (x) {
      setBusy(false);
      setErr(failText(x, online));
    }
  };
  const confirm = () => {
    const lei = parseWholeLei(amount);
    if (lei === null || lei <= 0) return setErr(`Scrie suma în lei întregi, de exemplu ${exact(150000)}.`);
    if (!day || day > today) return setErr('Alege o zi până azi.');
    void run('confirm_occurrence', { eventId: e.id, originalDate: occ.originalDate, amountLei: lei, date: day, clientId: newIntentKey() });
  };
  const remove = (scope: EditScope) => {
    if (scope === 'one') return void run('set_occurrence', { eventId: e.id, date: occ.originalDate, change: { cancelled: true } });
    if (scope === 'following' && occ.originalDate > e.starts_on) return void run('update_event', { id: e.id, patch: { scope: 'all', repeatUntil: addDays(occ.originalDate, -1) } });
    return void run('delete_event', { id: e.id });
  };
  const toPhone = async () => {
    const days = e.remind_days_before;
    const left = Math.round((Date.parse(occ.date) - Date.parse(today)) / 86_400_000);
    const reminder = days != null && left >= days ? { daysBefore: days, hour: view.data().params.calendar_reminder_hour.value } : null;
    const description = [occ.note, occ.amount != null ? `${exact(occ.amount)} lei` : null].filter(Boolean).join('\n');
    try {
      const how = await saveCalendarFile(`cropcash-${occ.date}.ics`, buildIcs({ id: occ.id, title: occ.title, date: occ.date, description }, reminder), occ.title);
      if (how === 'downloaded') setNote('Fișierul s-a descărcat. Deschide-l ca să intre în calendar.');
    } catch {
      setNote('Nu am putut face fișierul. Încearcă din nou.');
    }
  };

  return (
    <>
      {ask && (
        <div className="ev-ask">
          <p>{e.direction === 'in' ? 'Ai primit banii?' : 'Ai plătit?'}</p>
          <div className="row">
            <label>
              Cât, în lei
              <input inputMode="numeric" autoComplete="off" value={amount} onChange={(x) => setAmount(x.target.value)} />
            </label>
            <label>
              În ce zi
              <input type="date" max={today} value={day} onChange={(x) => setDay(x.target.value)} />
            </label>
          </div>
          <div className="row">
            <button type="button" className="btn btn-dark" disabled={busy} onClick={confirm}>
              {e.direction === 'in' ? 'Da, am primit' : 'Da, am plătit'}
            </button>
            <button type="button" className="btn btn-line" disabled={busy} onClick={() => void run('set_occurrence', { eventId: e.id, date: occ.originalDate, change: { cancelled: true } })}>
              Nu mai e cazul
            </button>
          </div>
          <small className="note">{t('„Da” notează suma la vânzări sau la cheltuieli, ca formularul de la Recolte.')}</small>
        </div>
      )}
      {!money && (
        <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void run('set_occurrence', { eventId: e.id, date: occ.originalDate, change: { done: !occ.done } })}>
          {occ.done ? 'Nu am făcut încă' : 'Am făcut'}
        </button>
      )}
      {money && occ.done && <small>{occ.transactionId ? (e.direction === 'in' ? 'Banii au intrat și sunt notați.' : 'Plata e făcută și notată.') : 'Făcut.'}</small>}
      {!occ.transactionId && (
        <button type="button" className="btn btn-line" disabled={busy} onClick={() => onEdit(e, occ.originalDate)}>
          Schimbă
        </button>
      )}
      {!deleting ? (
        <button type="button" className="btn btn-line" disabled={busy} onClick={() => setDeleting(true)}>
          Șterge
        </button>
      ) : series ? (
        <div className="ev-scope-ask" role="group" aria-label="Ce ștergi?">
          {SCOPES.filter(([s]) => s !== 'following' || occ.originalDate > e.starts_on).map(([s, l]) => (
            <button key={s} type="button" className="btn btn-line" disabled={busy} onClick={() => remove(s)}>
              Șterge: {l.toLowerCase()}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn btn-line" disabled={busy} onClick={() => remove('all')}>
          Da, șterge
        </button>
      )}
      {occ.date >= today && !occ.done && (
        <button type="button" className="btn btn-line" onClick={() => void toPhone()}>
          Pune în calendarul telefonului
        </button>
      )}
      {note && <small role="status">{note}</small>}
      {!online && farm.me && <small>Se trimite când ai internet.</small>}
      <ErrorLine>{err}</ErrorLine>
    </>
  );
}
