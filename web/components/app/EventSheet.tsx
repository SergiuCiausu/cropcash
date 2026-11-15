'use client';
/* „Adaugă în calendar” and „Schimbă”: one sheet for anything a farmer plans or wants to remember
   (docs/calendar-events-plan.md). Everything except parcel work is a farm event and saves offline
   (it waits in the queue). Parcel work goes to the parcel's list of work, which needs internet for now.
   A repeating event asks „Doar asta”, „De acum înainte” or „Toate” when it changes. */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  applyEventWrite,
  occurrenceId,
  storedToInput,
  type EditScope,
  type EventCategory,
  type EventRepeat,
  type StoredEvent,
} from '../../../packages/shared/src/calendar/events';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import type { OperationKind } from '../../../packages/shared/src/plots/model';
import type { ExpenseCategory } from '../../../packages/shared/src/farm/plan-inputs';
import { date, exact, failText } from '../../lib/cc/format';
import type { FarmPlots } from '../../lib/cc/plots';
import { usePlots } from '../plots/usePlots';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { EXPENSE_LABELS } from '../../lib/ui/categories';
import { AmountEcho, ErrorLine, Sheet } from './bits';
import '../../styles/events.css';

type Kind = 'plot' | 'crop' | 'animals' | 'machinery' | 'pay' | 'get' | 'paperwork' | 'other';
const KINDS: [Kind, string][] = [
  ['plot', 'Parcelă'],
  ['crop', 'Cultură'],
  ['animals', 'Animale'],
  ['machinery', 'Utilaje'],
  ['pay', 'Bani de plătit'],
  ['get', 'Bani de primit'],
  ['paperwork', 'Acte'],
  ['other', 'Altceva'],
];
const TITLES: Record<Kind, string[]> = {
  plot: [],
  crop: ['Verific cultura', 'Sun cumpărătorul'],
  animals: ['Vaccinare', 'Vine veterinarul', 'Fătare', 'Tuns'],
  machinery: ['Revizie la tractor', 'ITP', 'RCA', 'Reparație la combină'],
  pay: ['Rata la bancă', 'Arenda', 'Impozitul pe teren', 'Asigurarea'],
  get: ['Vând recolta', 'Primesc arenda'],
  paperwork: ['La primărie', 'La APIA', 'Registrul agricol', 'Contract'],
  other: [],
};
export const OPERATION_LABELS: [OperationKind, string][] = [
  ['herbicide', 'Erbicid'],
  ['fungicide', 'Fungicid'],
  ['insecticide', 'Insecticid'],
  ['fertilizing', 'Îngrășat'],
  ['soil_work', 'Arat sau discuit'],
  ['sowing', 'Semănat'],
  ['irrigation', 'Irigat'],
  ['harvest', 'Recoltat'],
  ['other', 'Altă lucrare'],
];
export const CATEGORY_WORDS: Record<EventCategory, string> = {
  crop: 'Cultură',
  animals: 'Animale',
  machinery: 'Utilaje',
  money: 'Bani',
  paperwork: 'Acte',
  other: 'Altceva',
};
const REPEATS: [EventRepeat, string][] = [
  ['none', 'Nu'],
  ['monthly', 'În fiecare lună'],
  ['yearly', 'În fiecare an'],
];
export const SCOPES: [EditScope, string][] = [
  ['one', 'Doar în ziua asta'],
  ['following', 'De acum înainte'],
  ['all', 'Toate'],
];

const kindOf = (e: StoredEvent): Kind => (e.category === 'money' ? (e.direction === 'in' ? 'get' : 'pay') : (e.category as Kind));
const categoryOf = (k: Kind): EventCategory => (k === 'pay' || k === 'get' ? 'money' : (k as EventCategory));
const remindWord = (d: number) => (d === 0 ? 'În ziua aceea' : d === 1 ? 'Cu o zi înainte' : `Cu ${d} zile înainte`);

export interface EventSheetProps {
  open: boolean;
  onClose: () => void;
  /** The day picked in the grid, for a new event. */
  day?: string | null;
  /** Editing: the event, and the date of it that was opened (for „Doar asta”). */
  editing?: { event: StoredEvent; originalDate: string } | null;
  /** A crop to start with (from a crop's row or the crop view). */
  cropId?: string | null;
  /** A parcel to note work on (the parcel card on /harta). */
  plotId?: string | null;
  /** After a save, for a page that shows what was saved. */
  onSaved?: () => void;
}

export function EventSheet(props: EventSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} className="detail ev-sheet" label={props.editing ? 'Schimbă' : 'Adaugă în calendar'} keepOnBackdrop>
      {props.open ? <EventForm key={props.editing ? occurrenceId(props.editing.event.id, props.editing.originalDate) : `new-${props.day}`} {...props} /> : null}
    </Sheet>
  );
}

function EventForm({ onClose, day, editing, cropId: startCrop, plotId: startPlot, onSaved }: EventSheetProps) {
  const farm = useFarm()!;
  const store = useStore()!;
  const view = useView('farm')!;
  const online = useOnline();
  const { text: t } = useMoney();
  const params = view.data().params.farmer_events;
  const today = view.today;
  const ev = editing?.event ?? null;
  const start = ev ? storedToInput(ev) : null;
  const opened = editing ? (ev?.farm_event_occurrences ?? []).find((o) => o.original_date === editing.originalDate) : undefined;

  const [kind, setKind] = useState<Kind | null>(ev ? kindOf(ev) : startPlot ? 'plot' : startCrop ? 'crop' : null);
  const [title, setTitle] = useState(opened?.title ?? start?.title ?? '');
  const [startsOn, setStartsOn] = useState(opened?.moved_to ?? editing?.originalDate ?? day ?? today);
  const [endsOn, setEndsOn] = useState(start?.endsOn ?? '');
  const [atTime, setAtTime] = useState(opened?.at_time?.slice(0, 5) ?? start?.atTime ?? '');
  const [remind, setRemind] = useState<string>(start?.remindDaysBefore != null ? String(start.remindDaysBefore) : '');
  const [repeat, setRepeat] = useState<EventRepeat>(start?.repeat ?? 'none');
  const [until, setUntil] = useState(start?.repeatUntil ?? '');
  const [note, setNote] = useState(opened?.note ?? start?.note ?? '');
  const [amount, setAmount] = useState(opened?.amount_bani != null ? String(opened.amount_bani / 100) : start?.amountLei != null ? String(start.amountLei) : '');
  const [expense, setExpense] = useState<ExpenseCategory>((start?.expenseCategory as ExpenseCategory) ?? 'other');
  const [cropId, setCropId] = useState(start?.cropId ?? startCrop ?? '');
  const [replaces, setReplaces] = useState<boolean | null>(ev ? !!ev.replaces_estimate : null);
  const [scope, setScope] = useState<EditScope>(ev && ev.repeat !== 'none' ? 'one' : 'all');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /* Parcel work, on a farm on the server. Without internet the parcels come from the copy on the phone,
     and the work waits in the queue (docs/harta-plan.md step 11). */
  const [plotId, setPlotId] = useState(startPlot ?? '');
  const [opKind, setOpKind] = useState<OperationKind>('fungicide');
  const [product, setProduct] = useState('');
  const clientId = useRef(newIntentKey());

  const onServer = !!farm.me;
  const farmPlots = usePlots(view.baseYear, { fetch: onServer && !ev }).plots;
  const plots: FarmPlots | null = onServer && !ev ? farmPlots : null;

  const crops = view.scoped.parcels.map((p) => ({ id: p.cropId, name: view.cropName(p.cropId) }));
  const money = kind === 'pay' || kind === 'get';
  const series = !!ev && ev.repeat !== 'none';
  const scopeOne = series && scope === 'one';
  const lei = amount.trim() ? parseWholeLei(amount) : null;

  /* The plan's own estimate this sum may stand for: the crop's cost that month, or its next sale. */
  const plan = view.farmPlan();
  const estimate = useMemo(() => {
    if (!money || !cropId) return null;
    const entries = plan.timelines.medium.months.flatMap((m) => m.entries);
    if (kind === 'pay') {
      if (!['seeds', 'fertilizer', 'treatments', 'diesel', 'field_work'].includes(expense)) return null;
      const month = startsOn.slice(0, 7);
      const sum = entries.filter((e) => e.kind === 'input_cost' && e.cropId === cropId && e.date.slice(0, 7) === month).reduce((s, e) => s + e.value, 0);
      return sum > 0 ? sum : null;
    }
    const sale = entries.find((e) => e.kind === 'crop_sale' && e.cropId === cropId && !e.id.startsWith('stored:'));
    return sale?.value ?? null;
  }, [money, cropId, kind, expense, startsOn, plan]);
  /* „E toată recolta” starts ticked when the sum is near the estimate (P-EV3). */
  const near = kind === 'get' && estimate != null && lei != null && Math.abs(lei * 100 - estimate) * 100 <= estimate * params.whole_harvest_match_pct.value;
  const replacing = replaces ?? (kind === 'get' ? near : false);

  /* What gets sent, so the same input gives the salary preview and the save. */
  const write = (): [string, Record<string, unknown>] | null => {
    if (!kind || kind === 'plot') return null;
    const fields = {
      category: categoryOf(kind),
      title: title.trim(),
      note: note.trim() || null,
      startsOn,
      endsOn: repeat === 'none' && endsOn && endsOn > startsOn ? endsOn : null,
      atTime: atTime || null,
      repeat,
      repeatUntil: repeat !== 'none' && until ? until : null,
      remindDaysBefore: remind === '' ? null : Number(remind),
      cropId: cropId || null,
      ...(money
        ? {
            direction: kind === 'get' ? 'in' : 'out',
            amountLei: lei,
            expenseCategory: kind === 'pay' ? expense : null,
            replacesEstimate: !!cropId && estimate != null && replacing,
          }
        : { direction: null, amountLei: null, expenseCategory: null, replacesEstimate: false }),
    };
    if (!ev) return ['add_event', { ...fields, clientId: clientId.current }];
    if (scopeOne) {
      return [
        'set_occurrence',
        {
          eventId: ev.id,
          date: editing!.originalDate,
          change: { movedTo: startsOn, title: title.trim() === ev.title ? null : title.trim(), note: (note.trim() || null) === (ev.note ?? null) ? null : note.trim() || null, atTime: atTime || null, ...(money ? { amountLei: lei === Math.round((ev.amount_bani ?? 0) / 100) ? null : lei } : {}) },
        },
      ];
    }
    if (scope === 'following') {
      const { startsOn: _s, ...rest } = fields;
      return ['update_event', { id: ev.id, patch: { ...rest, scope: 'following', from: editing!.originalDate, newId: clientId.current } }];
    }
    return ['update_event', { id: ev.id, patch: { ...fields, scope: 'all' } }];
  };

  /* Live: the safe salary before and after this change (only money changes it). */
  const preview = useMemo(() => {
    if (!money || lei == null || lei <= 0 || !title.trim()) return null;
    const w = write();
    if (!w) return null;
    const f = view.storedFarm();
    const after = applyEventWrite(f.farm_events ?? [], w[0], w[1], new Date(`${today}T12:00:00Z`));
    try {
      return { before: plan.salary.salary, after: view.farmPlan({ ...f, farm_events: after }).salary.salary };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [money, lei, title, startsOn, repeat, until, cropId, expense, replacing, scope, kind]);

  /* How many one-day changes „Toate” or „De acum înainte” would lose. */
  const lost = useMemo(() => {
    if (!ev || scopeOne) return 0;
    const w = write();
    if (!w) return 0;
    const after = applyEventWrite([ev], w[0], w[1], new Date());
    const kept = after.reduce((n, e) => n + (e.farm_event_occurrences?.length ?? 0), 0);
    return Math.max(0, (ev.farm_event_occurrences?.length ?? 0) - kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev, scope, startsOn, repeat, until]);

  function check(): string | null {
    if (!kind) return 'Alege despre ce este.';
    if (kind === 'plot') {
      if (!plotId) return 'Alege parcela.';
      return startsOn ? null : 'Alege ziua.';
    }
    if (!title.trim()) return 'Scrie pe scurt ce este, de exemplu „Vaccinare”.';
    if (title.trim().length > 80) return 'Scrie mai pe scurt, cel mult 80 de litere.';
    if (!startsOn) return 'Alege ziua.';
    if (repeat === 'none' && endsOn && endsOn < startsOn) return 'Ultima zi nu poate fi înaintea primei zile.';
    if (repeat !== 'none' && until && until < startsOn) return '„Până când” nu poate fi înaintea primei zile.';
    if (money && (lei == null || lei <= 0)) return `Scrie suma în lei întregi, de exemplu ${exact(150000)}.`;
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) return setErr(problem);
    setErr(null);
    setBusy(true);
    try {
      if (kind === 'plot') {
        const year = view.baseYear + (startsOn.slice(5, 7) >= '11' ? 1 : 0);
        await store.send(({ write }) =>
          write('add_operation', { plotId, harvestYear: year, kind: opKind, status: startsOn < today ? 'done' : 'planned', onDate: startsOn, product: product.trim() || null, note: note.trim() || null, clientId: clientId.current }),
        );
      } else {
        const w = write()!;
        await store.eventWrite(w[0] as never, w[1]);
      }
      setBusy(false);
      onSaved?.();
      setDone(online || !onServer ? 'Am pus în calendar.' : 'Am pus în calendar. Se trimite când ai internet.');
      setTimeout(onClose, 900);
    } catch (e2) {
      setBusy(false);
      setErr(failText(e2, online));
    }
  }

  const head = ev ? 'Schimbă' : 'Ce vrei să notezi?';
  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          {head}
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>

      {!ev && (
        <fieldset className="ev-kinds">
          <legend>Despre ce?</legend>
          <div className="chips">
            {KINDS.filter(([k]) => k !== 'plot' || (plots?.plots.length ?? 0) > 0).map(([k, label]) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {kind && (
        <div className="ev-fields">
          {kind === 'plot' ? (
            <>
              <label>
                Parcela
                <select value={plotId} onChange={(e) => setPlotId(e.target.value)}>
                  <option value="">Alege</option>
                  {(plots?.plots ?? [])
                    .filter((p) => !p.archived_at)
                    .map((p) => {
                      const crop = plots!.seasons.find((s) => s.plot_id === p.id && s.harvest_year === view.baseYear)?.crop_id;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name ?? (p.bloc_fizic ? `Bloc ${p.bloc_fizic}${p.parcel_no ? `, parcela ${p.parcel_no}` : ''}` : 'Parcelă fără nume')}
                          {crop ? `, ${view.cropName(crop).toLowerCase()}` : ''}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label>
                Ce lucrare
                <select value={opKind} onChange={(e) => setOpKind(e.target.value as OperationKind)}>
                  {OPERATION_LABELS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cu ce produs <small>(dacă știi)</small>
                <input value={product} maxLength={120} onChange={(e) => setProduct(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              {TITLES[kind].length > 0 && !ev && (
                <div className="chips ev-titles" role="group" aria-label="Variante">
                  {TITLES[kind].map((x) => (
                    <button key={x} type="button" className="chip" aria-pressed={title === x} onClick={() => setTitle(x)}>
                      {x}
                    </button>
                  ))}
                </div>
              )}
              <label>
                Ce este
                <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              </label>
              {(kind === 'crop' || money) && (
                <label>
                  {money ? 'Pentru ce cultură' : 'Cultura'}
                  <select value={cropId} onChange={(e) => setCropId(e.target.value)}>
                    <option value="">{money ? 'Toată ferma' : 'Alege'}</option>
                    {crops.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {money && (
                <>
                  <label>
                    {series && scopeOne ? 'Suma în ziua asta, în lei' : repeat === 'none' ? 'Suma, în lei' : 'Suma de fiecare dată, în lei'}
                    <input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <AmountEcho text={amount} />
                  </label>
                  {kind === 'pay' && !scopeOne && (
                    <label>
                      Pe ce
                      <select value={expense} onChange={(e) => setExpense(e.target.value as ExpenseCategory)}>
                        {EXPENSE_LABELS.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {estimate != null && !scopeOne && (
                    <label className="ev-check">
                      <input type="checkbox" checked={replacing} onChange={(e) => setReplaces(e.target.checked)} />
                      <span>
                        {kind === 'get'
                          ? t(`E toată recolta. Pune-o în locul vânzării estimate, de ${exact(estimate)} lei.`)
                          : t(`Pune-o în locul estimării pentru luna asta, de ${exact(estimate)} lei.`)}
                      </span>
                    </label>
                  )}
                </>
              )}
            </>
          )}

          <label>
            {kind !== 'plot' && repeat === 'none' && endsOn ? 'Prima zi' : 'Ziua'}
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          {kind !== 'plot' && (
            <>
              {repeat === 'none' && !scopeOne && (
                <label>
                  Ultima zi <small>(dacă ține mai multe zile)</small>
                  <input type="date" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                </label>
              )}
              <label>
                La ce oră <small>(dacă e cazul)</small>
                <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} />
              </label>
              {!scopeOne && (
                <>
                  <label>
                    Să-mi amintești
                    <select value={remind} onChange={(e) => setRemind(e.target.value)}>
                      <option value="">Nu</option>
                      {params.remind_options_days.values.map((d) => (
                        <option key={d} value={String(d)}>
                          {remindWord(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Se repetă
                    <select value={repeat} onChange={(e) => setRepeat(e.target.value as EventRepeat)}>
                      {REPEATS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {repeat !== 'none' && (
                    <label>
                      Până când <small>(dacă știi)</small>
                      <input type="date" min={startsOn} value={until} onChange={(e) => setUntil(e.target.value)} />
                    </label>
                  )}
                </>
              )}
            </>
          )}
          <label className="ev-wide">
            Notă <small>(dacă vrei)</small>
            <textarea rows={2} maxLength={kind === 'plot' ? 200 : 500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      )}

      {series && (
        <fieldset className="ev-scope">
          <legend>Ce schimbi?</legend>
          <div className="chips">
            {SCOPES.filter(([s]) => s !== 'following' || editing!.originalDate !== ev!.starts_on).map(([s, l]) => (
              <button key={s} type="button" className="chip" aria-pressed={scope === s} onClick={() => setScope(s)}>
                {l}
              </button>
            ))}
          </div>
          {!scopeOne && lost > 0 && (
            <p className="m-warn">
              {lost === 1 ? 'O schimbare făcută doar pe o zi se pierde.' : `${lost} schimbări făcute doar pe o zi se pierd.`}
            </p>
          )}
        </fieldset>
      )}

      {preview && preview.after !== preview.before && (
        <p className="ev-preview" role="status">
          {t(`Salariul sigur: ${exact(preview.before)} → ${exact(preview.after)} lei pe lună.`)}
        </p>
      )}
      {kind && kind !== 'plot' && startsOn < today && !ev && <p className="note">Ziua a trecut. O notez, iar dacă e o sumă te întreb dacă s-a întâmplat.</p>}
      <ErrorLine>{err}</ErrorLine>
      <div className="acts">
        {kind === 'plot' ? (
          <button type="submit" className="btn btn-dark" disabled={busy}>
            Pune în calendar
          </button>
        ) : (
          <button type="submit" className="btn btn-dark" disabled={busy || !kind}>
            {ev ? 'Salvează' : 'Pune în calendar'}
          </button>
        )}
        <button type="button" className="btn btn-line" onClick={onClose}>
          Renunță
        </button>
        {done && <small role="status">{done}</small>}
        {startsOn && kind && kind !== 'plot' && <small className="ev-when">{date(startsOn, true)}</small>}
      </div>
    </form>
  );
}
