'use client';
/* "Calendar": month grid, list_upcoming, get_event, list_tasks, complete_task, reopen_task, plus followed
   calls (was web/legacy/calendar.js). Money, work and official dates come from buildFarmPlan, so this
   page shows what the plan shows. A ticked task goes through the outbox on a real farm, so it works
   offline; on Ion's farm it stays on the phone. Removing a followed call needs internet. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { eventItems, forCrop, parseOccurrenceId, type EventItem, type StoredEvent } from '../../../packages/shared/src/calendar/events';
import { lastDay } from '../../../packages/shared/src/cashflow/dates';
import { date, daysLeft, exact, zile } from '../../lib/cc/format';
import { loadPlots, type FarmPlots } from '../../lib/cc/plots';
import { useOnline, useStore } from '../../lib/cc/react';
import { CATEGORY_WORDS, EventSheet, OPERATION_LABELS } from '../app/EventSheet';
import { callName } from '../../lib/cc/monitor';
import type { PlanItem } from '../../lib/cc/plan';
import { useFarm, useMoney, useMonitor, useView } from '../../lib/cc/react';
import type { IconName } from '../../lib/ui/icons';
import { CHEVRON, Icon, OfflineNote, useHref, Verify } from '../app/bits';
import { ItemActions, ItemDetail, ItemSheet, MONTH_NAMES, monthName, type SheetItem } from '../app/ItemSheet';
import { EventActions, findOccurrence } from '../app/EventActions';
import { FutureNote } from '../app/PageNotes';
import { contractDays, contractViews, contractWindow } from '../../lib/cc/contracts';
import { PageLink } from '../app/Frame';

const MONTH_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const WEEKDAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const VIEWS: [Tab, string][] = [
  ['all', 'Tot'],
  ['money', 'Bani'],
  ['todo', 'De făcut'],
  ['work', 'Lucrări'],
  ['mine', 'Ale mele'],
];
type Tab = 'all' | 'money' | 'todo' | 'work' | 'mine';
const EVENT_ICONS: Record<EventItem['category'], IconName> = { crop: 'sprout', animals: 'home', machinery: 'tool', money: 'sack', paperwork: 'cal', other: 'more', plot: 'spray' };
const monthShort = (key: string) => MONTH_SHORT[+key.split('-')[1] - 1];
const signedText = (bani: number) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const longDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1].toLowerCase()}`;
};
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[utc(y, m, d).getUTCDay()];
};
const count = (n: number) => (n === 1 ? 'un lucru' : `${n} lucruri`);

/** A plan entry, a followed call, or one of the farmer's own events, as a row of the calendar. */
type Item = SheetItem & { icon: IconName; doneOwn?: boolean; op?: boolean; category?: EventItem['category'] };

const FILTER: Record<Tab, (i: Item) => boolean> = {
  all: () => true,
  money: (i) => i.direction !== 'none',
  todo: (i) => !!i.task || !!i.follow || (!!i.ev && i.direction === 'none') || !!i.op || (!!i.contract && i.direction === 'none'),
  work: (i) => i.kind === 'input_cost' || !!i.op || i.category === 'crop',
  mine: (i) => !!i.ev || !!i.op,
};

/** A farmer's event or a piece of parcel work as a calendar row. Money comes through the plan instead. */
function ownItem(x: EventItem, plotName: (id: string) => string, cropName: (id: string) => string): Item {
  const op = x.operation;
  const title = op ? `${OPERATION_LABELS.find(([k]) => k === op.kind)?.[1] ?? 'Lucrare'}${op.product ? `: ${op.product}` : ''}` : x.title;
  const where = op ? plotName(op.plot_id) : x.cropId ? cropName(x.cropId) : x.category === 'plot' ? '' : CATEGORY_WORDS[x.category];
  const when = x.occurrence?.atTime ? `, la ${x.occurrence.atTime}` : x.endDate && x.endDate !== x.date ? `, până pe ${date(x.endDate)}` : '';
  return {
    id: x.id,
    kind: (op ? 'plot_work' : 'farmer_event') as SheetItem['kind'],
    title,
    date: x.date as string,
    month: x.month as string,
    window: null,
    amount: x.amount != null ? { min: x.amount, probable: x.amount, max: x.amount } : null,
    value: x.amount ?? 0,
    direction: x.direction,
    estimated: false,
    unverified: false,
    event: null,
    sub: `${where}${when}${x.repeat !== 'none' ? (where || when ? ', ' : '') + (x.repeat === 'monthly' ? 'lunar' : 'anual') : ''}` || 'Notat de tine',
    icon: EVENT_ICONS[x.category],
    tone: 'b',
    task: false,
    exactDay: !!x.date,
    ...(x.occurrence ? { ev: { eventId: x.occurrence.eventId, originalDate: x.occurrence.originalDate } } : {}),
    doneOwn: x.done,
    op: !!op,
    category: x.category,
  };
}
const shade = (i: Item) => (i.direction === 'in' ? 'in' : i.direction === 'out' ? 'out' : 'task');
const chipText = (i: Item) => (i.direction === 'none' ? i.title : `${i.direction === 'in' ? '+' : '−'}${exact(i.value)}`);

export default function Calendar() {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const monitor = useMonitor();
  const href = useHref();
  const { text: t } = useMoney();
  const TODAY = view.today;
  const crop = view.crop;
  const data = view.data();
  const plan = view.farmPlan();
  const timeline = plan.timelines.medium;
  const months = crop ? crop.months(timeline) : timeline.months;
  const onServer = !!farm.me;
  const store = useStore()!;
  const online = useOnline();
  const done = useMemo(() => new Set(farm.doneTasks), [farm.doneTasks]);
  /* Parcels and their work come from the server for now, so they show only with internet. */
  const [plots, setPlots] = useState<FarmPlots | null>(null);
  useEffect(() => {
    if (!onServer || !online) return;
    let live = true;
    loadPlots(store.live)
      .then((p) => live && setPlots(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [onServer, online, store]);
  /* „Adaugă” on a day, or „Schimbă” on an event. */
  const [adding, setAdding] = useState<{ day: string | null } | null>(null);
  const [editing, setEditing] = useState<{ event: StoredEvent; originalDate: string } | null>(null);
  const left = (iso: string) => daysLeft(iso, TODAY);

  /* Followed calls come from the same list as /oportunitati. Variants of one call count once. */
  const items = useMemo(() => {
    const seen = new Map<string, Item>();
    for (const c of crop ? [] : monitor.followed) {
      const name = callName(c as { title: string });
      const deadline = c.deadline ?? null;
      const id = `follow:${name}:${deadline}`;
      if (!seen.has(id))
        seen.set(id, {
          id,
          kind: 'follow',
          title: name,
          date: deadline as string,
          month: deadline ? deadline.slice(0, 7) : (null as unknown as string),
          window: undefined,
          amount: undefined,
          value: 0,
          direction: 'none',
          estimated: false,
          unverified: false,
          event: null,
          sub: deadline ? `Până pe ${date(deadline)}, apel urmărit` : 'Fără termen, apel urmărit',
          icon: 'sprout',
          tone: 'b',
          task: false,
          follow: true,
          exactDay: !!deadline,
          url: c.url,
          keys: [],
          budgets: [],
        } as unknown as Item);
      seen.get(id)!.keys!.push(c.key);
      seen.get(id)!.budgets!.push((c as { budgetEur?: number | null }).budgetEur);
    }
    const followed = [...seen.values()].filter((i) => !i.date || i.date >= TODAY);
    const list = months.flatMap((m) =>
      m.entries.map((e) => {
        const it = view.planItem(e, m.key) as unknown as Item;
        /* A sum the farmer planned: the plan gives its amount, the event gives the rest. */
        const occ = it.own ? parseOccurrenceId(it.id) : null;
        return occ ? { ...it, ev: occ } : it;
      }),
    );
    /* The farmer's events without money, money already answered, and parcel work. */
    const from = `${months[0].key}-01`;
    const to = lastDay(months[months.length - 1].key);
    const seasons = plots?.seasons ?? [];
    const all = eventItems(farm.events, plots?.operations ?? [], plots?.plots ?? [], seasons, from, to);
    const plotName = (id: string) => {
      const p = plots?.plots.find((x) => x.id === id);
      return p?.name ?? (p?.bloc_fizic ? `Bloc ${p.bloc_fizic}` : 'Parcelă');
    };
    const own = (crop ? forCrop(all, crop.id, seasons) : all).filter((x) => x.direction === 'none' || x.done).map((x) => ownItem(x, plotName, view.cropName));
    /* A contract's last day to act and its end (docs/contracts-plan.md §3.4): the whole farm's, not one crop's. */
    const contractItems = crop
      ? []
      : contractDays(contractViews(farm.contracts, data, contractWindow(TODAY, months.length)), from, to).map(
          (d) =>
            ({
              id: d.id,
              kind: 'contract_day',
              title: d.title,
              date: d.date,
              month: d.date.slice(0, 7),
              window: undefined,
              amount: undefined,
              value: 0,
              direction: 'none',
              estimated: false,
              unverified: false,
              event: null,
              sub: `Pe ${date(d.date)}. Hotărăști la Contracte`,
              icon: 'check',
              tone: 'b',
              task: false,
              contract: true,
              exactDay: true,
            }) as unknown as Item,
        );
    return [...list, ...own, ...followed, ...contractItems].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  }, [view, months, monitor.followed, crop, TODAY, farm.events, farm.contracts, data, plots]);
  const isDone = (i: Item) => (i.ev || i.op ? !!i.doneOwn : !!i.task && done.has(i.id));

  /* ---- State that a fresh load used to reset ---- */
  const calKeys = months.map((m) => m.key);
  const hasToday = calKeys.includes(TODAY.slice(0, 7));
  const [calMonthState, setCalMonth] = useState(hasToday ? TODAY.slice(0, 7) : calKeys[0]);
  /* A harvest picked from the sheet has other months. */
  const calMonth = calKeys.includes(calMonthState) ? calMonthState : hasToday ? TODAY.slice(0, 7) : calKeys[0];
  const [calDayState, setCalDay] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const showMonth = (key: string) => {
    setCalMonth(key);
    setCalDay(null);
  };

  /* ---- Rows ---- */
  const right = (i: Item) => {
    if (i.direction !== 'none') return <span className={`c-amt ${i.direction === 'in' ? 'pos' : ''}`}>{t(`${i.direction === 'in' ? '+' : '−'}${exact(i.value)} lei`)}</span>;
    if (!i.date) return null;
    const d = left(i.date);
    return <span className={`c-amt${d <= 14 ? ' soon' : ''}`}>{d >= 0 && d < 60 ? (d === 0 ? 'Azi' : `În ${zile(d)}`) : date(i.date)}</span>;
  };
  const row = (i: Item) => (
    <button key={i.id} type="button" className={`crow${isDone(i) ? ' is-done' : ''}`} onClick={() => setOpenId(i.id)}>
      <span className={`ti ${i.tone}`}>
        <Icon name={i.icon} />
      </span>
      <span className="r-main">
        <b>
          {i.title}
          {i.unverified ? (
            <>
              {' '}
              <Verify />
            </>
          ) : null}
        </b>
        <small>{i.sub}</small>
      </span>
      {right(i)}
    </button>
  );

  /* ---- Month grid: Monday first, only the 12 plan months ----
     Only items with a real day sit on a day. Anything known just by month stays under the grid,
     so the grid never shows a date we don't have. */
  const onDay = new Map<string, Item[]>();
  for (const i of items) {
    if (!i.exactDay || !i.date || i.date.slice(0, 7) !== calMonth) continue;
    if (!onDay.has(i.date)) onDay.set(i.date, []);
    onDay.get(i.date)!.push(i);
  }
  const loose = items.filter((i) => !i.exactDay && i.month === calMonth);
  /* APIA pays on some day of a window. The plan counts the last day; the other months only get a note, with no sum. */
  const openWindow = items.filter((i) => (i.kind === 'apia_advance' || i.kind === 'apia_balance') && i.date.slice(0, 7) !== calMonth && i.window!.start.slice(0, 7) <= calMonth && calMonth <= i.window!.end.slice(0, 7));
  /* Keeps the picked day while it still has something on it. */
  const days = [...onDay.keys()].sort();
  const calDay = calDayState && onDay.has(calDayState) ? calDayState : onDay.has(TODAY) ? TODAY : (days.find((d) => d >= TODAY) ?? days[0] ?? null);

  const [y, m] = calMonth.split('-').map(Number);
  const info = months.find((x) => x.key === calMonth)!;
  const lead = (utc(y, m, 1).getUTCDay() + 6) % 7;
  const total = utc(y, m + 1, 0).getUTCDate();
  const trail = (7 - ((lead + total) % 7)) % 7;
  const at = calKeys.indexOf(calMonth);
  const blanks = (n: number, prefix: string) => Array.from({ length: n }, (_, k) => <div key={`${prefix}${k}`} className="cal-cell blank" />);
  const dayCell = (iso: string) => {
    const list = onDay.get(iso);
    const cls = `cal-cell${iso < TODAY ? ' past' : ''}${iso === TODAY ? ' today' : ''}`;
    const num = <span className="cal-num">{+iso.slice(8)}</span>;
    if (!list)
      return (
        <div key={iso} className={cls}>
          {num}
        </div>
      );
    return (
      <button key={iso} type="button" className={`${cls} has`} aria-pressed={iso === calDay} aria-label={`${iso === TODAY ? 'Azi, ' : ''}${longDate(iso)}, ${count(list.length)}`} onClick={() => setCalDay(iso)}>
        {num}
        <span className="cal-chips">
          {list.slice(0, 2).map((i) => (
            <span key={i.id} className={`cal-chip ${shade(i)}${isDone(i) ? ' done' : ''}`}>
              {chipText(i)}
            </span>
          ))}
          {list.length > 2 && <span className="cal-more">+{list.length - 2}</span>}
        </span>
        <span className="cal-dots">
          {list.slice(0, 3).map((i) => (
            <i key={i.id} className={`${shade(i)}${isDone(i) ? ' done' : ''}`} />
          ))}
        </span>
      </button>
    );
  };

  /* What an item says, on the green card and in the pop-up alike. */
  const detailBody = (i: Item) => <ItemDetail item={i} items={items} view={view} />;
  const actions = (i: Item, onDone: () => void) => {
    const occ = i.ev ? findOccurrence(farm.events, i.ev.eventId, i.ev.originalDate) : null;
    return occ ? <EventActions key={i.id} occ={occ} onDone={onDone} onEdit={(event, originalDate) => setEditing({ event, originalDate })} /> : <ItemActions key={i.id} item={i} onDone={onDone} />;
  };

  /* ---- Green card: the next dated thing in full, then three numbers ---- */
  /* A later harvest starts in its own year, so today's deadlines don't lead its calendar. */
  const from = [TODAY, `${months[0].key}-01`].sort().pop()!;
  const next = items.find((i) => !isDone(i) && i.exactDay && i.date >= from);
  const soonTasks = items.filter((i) => (i.task || i.follow || i.ev || i.op) && !isDone(i) && i.date && left(i.date) >= 0 && left(i.date) <= 30).length;
  const coming = months.reduce((s, x) => s + x.in, 0);

  /* ---- The list ---- */
  const open = items.filter((i) => !isDone(i));
  const shown = open.filter(FILTER[tab]);
  let warned = false;
  const blocks = months.map((mo) => {
    const list = shown.filter((i) => i.month === mo.key);
    const first = mo.hard && !warned && list.length > 0;
    if (first) warned = true;
    if (!list.length && tab !== 'all') return null;
    const head = <h2>{monthName(mo.key)}</h2>;
    if (!list.length)
      return (
        <section key={mo.key} className="month none" id={`m-${mo.key}`}>
          {head}
          <p>Nimic planificat</p>
        </section>
      );
    return (
      <section key={mo.key} className={`month${mo.hard ? ' hard' : ''}`} id={`m-${mo.key}`}>
        <header className="m-h">
          {head}
          <p className="m-sum">
            {mo.in ? <span>{t(`Intră ${exact(mo.in)} lei`)}</span> : null}
            {mo.out ? <span>{t(`Ies ${exact(mo.out)} lei`)}</span> : null}
            {crop ? null : (
              <span>
                <b>{t(`Rămân ${signedText(mo.balanceEnd)}`)}</b>
              </span>
            )}
          </p>
        </header>
        {first && <p className="m-warn">Luni grele: ies mulți bani și aproape nu intră nimic.</p>}
        <div className="rows">{list.map(row)}</div>
      </section>
    );
  });
  const last = months[months.length - 1].key;
  const later = shown.filter((i) => !i.month || i.month > last);
  const finished = items.filter(isDone);
  const rule = data.calendar.events.find((e) => e.id === 'apia-modificari')! as { title_ro: string; relative_days?: number };
  const item = openId ? items.find((i) => i.id === openId) : undefined;

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Calendar</h1>
          <p className="lead">{crop ? `Lucrările și banii pentru ${crop.name.toLowerCase()}, pe un singur an.` : 'Bani, termene și lucrări, pe un singur an.'}</p>
        </div>
        <div className="acts cal-new">
          <button type="button" className="btn btn-dark" onClick={() => setAdding({ day: calDay && calDay >= TODAY ? calDay : null })}>
            Adaugă
          </button>
        </div>
      </header>
      <FutureNote />
      <OfflineNote>Nu ai internet. Vezi ultimele date salvate. Ce bifezi se trimite când ai internet.</OfflineNote>
      <section className="card cal" aria-labelledby="cal-title">
        <div className="cal-h">
          <h2 id="cal-title" aria-live="polite">
            {monthName(calMonth)}
          </h2>
          <div className="cal-nav">
            {hasToday && (
              <button type="button" onClick={() => showMonth(TODAY.slice(0, 7))}>
                Azi
              </button>
            )}{' '}
            <button type="button" className="cal-arrow" aria-label="Luna trecută" disabled={at === 0} onClick={() => showMonth(calKeys[at - 1])}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>{' '}
            <button type="button" className="cal-arrow" aria-label="Luna viitoare" disabled={at === calKeys.length - 1} onClick={() => showMonth(calKeys[at + 1])}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="cal-body">
          <div className="cal-main">
            <div className="cal-week" aria-hidden="true">
              {['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className={`cal-grid${info.hard ? ' hard' : ''}`}>
              {blanks(lead, 'a')}
              {Array.from({ length: total }, (_, k) => dayCell(`${calMonth}-${pad(k + 1)}`))}
              {blanks(trail, 'b')}
            </div>
          </div>
          <div className="cal-side">
            <div className="cal-day" aria-live="polite">
              {info.hard && <p className="m-warn">Lună grea: ies mulți bani și aproape nu intră nimic.</p>}
              {calDay ? (
                <>
                  <h3>
                    {weekday(calDay)}, {longDate(calDay)}
                    {calDay === TODAY ? (
                      <>
                        {' '}
                        <span className="tag ok">Azi</span>
                      </>
                    ) : null}
                  </h3>
                  <div className="rows">{onDay.get(calDay)!.map(row)}</div>
                  <button type="button" className="cal-add" onClick={() => setAdding({ day: calDay })}>
                    + Adaugă în ziua asta
                  </button>
                </>
              ) : loose.length || openWindow.length ? null : (
                <p className="cal-none">Nimic planificat în luna asta.</p>
              )}
            </div>
            <div className="cal-month">
              {loose.length > 0 && (
                <>
                  <h3>În cursul lunii</h3>
                  <div className="rows">{loose.map(row)}</div>
                </>
              )}
              {openWindow.map((i) => (
                <button key={i.id} type="button" className="cal-open" onClick={() => setOpenId(i.id)}>
                  Poate veni oricând luna asta: {i.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="cta field verdict">
        <div className="v-main">
          <p className="eyebrow">Urmează</p>
          <h2>{next ? next.title : 'Nimic în următoarele 12 luni.'}</h2>
          {next ? detailBody(next) : null}
          {next && (next.task || next.follow || next.ev) ? (
            <div className="v-acts">
              {actions(next, () => undefined)}
            </div>
          ) : null}
        </div>
        <dl className="v-row">
          <div>
            <dd>{soonTasks}</dd>
            <dt>{soonTasks === 1 ? 'termen' : 'termene'} în 30 de zile</dt>
          </div>
          <div>
            <dd>{t(`${exact(coming)} lei`)}</dd>
            <dt>de intrat în 12 luni</dt>
          </div>
          {crop ? (
            <div>
              <dd>{t(`${exact(months.reduce((s, x) => s + x.out, 0))} lei`)}</dd>
              <dt>de ieșit în 12 luni</dt>
            </div>
          ) : (
            <div>
              <dd>{t(signedText(timeline.lowest.balance))}</dd>
              <dt>cel mai jos, în {monthShort(timeline.lowest.key)}</dt>
            </div>
          )}
        </dl>
      </section>
      <div className="vtabs" role="group" aria-label="Ce arăt">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={v === tab} onClick={() => setTab(v)}>
            {label}
            <span className="n">{open.filter(FILTER[v]).length}</span>
          </button>
        ))}
      </div>
      <div>
        {blocks.map((b, i) => (
          <Fragment key={i}>{b}</Fragment>
        ))}
        {later.length > 0 && (
          <section className="month">
            <header className="m-h">
              <h2>Mai târziu</h2>
            </header>
            <div className="rows">{later.map(row)}</div>
          </section>
        )}
        {!shown.length && <p className="empty">Nimic de făcut acum.</p>}
      </div>
      <div>
        {finished.length > 0 && (
          <details className="group acc">
            <summary>
              <span>
                <span className="g-t">
                  Făcute <span className="n">{finished.length}</span>
                </span>
              </span>
              <span className="cue">
                <span className="show">Arată</span>
                <span className="hide">Ascunde</span>
                {CHEVRON}
              </span>
            </summary>
            <div className="rows">{finished.map(row)}</div>
          </details>
        )}
      </div>
      {!crop && (
        <section className="card remember">
          <p className="eyebrow">Ține minte</p>
          <p>
            {rule.title_ro}: ai {rule.relative_days} zile de la schimbare.
          </p>
        </section>
      )}
      <p className="note gap">
        {crop
          ? `Partea de la APIA e împărțită după hectare. Termenele APIA, banii din cont și oportunitățile sunt la ${view.projectName(view.selected)}.`
          : t(`Am pornit de la ${exact(view.farm.startBalanceBani)} lei în cont${farm.isIon ? ', ca în exemplul lui Ion' : ''}. Sumele de aici nu scad salariul de ${exact(plan.salary.salary)} lei și pensia de ${exact(view.pensionBani())} lei pe lună. Sumele puse de tine în calendar intră în plan, așa că salariul socotește cu ele.${onServer ? '' : ' Apelurile urmărite sunt exemple pentru demo.'}`)}
      </p>{' '}
      <PageLink path="/prognoza" href={href('/prognoza')} className="btn btn-dark next-step">
        Mai departe: prognoza pe un an
      </PageLink>
      <ItemSheet item={item ?? null} items={items} view={view} onClose={() => setOpenId(null)} onEdit={(event, originalDate) => setEditing({ event, originalDate })} />
      <EventSheet open={!!adding || !!editing} day={adding?.day ?? null} editing={editing} cropId={crop?.id ?? null} onClose={() => (setAdding(null), setEditing(null))} />
    </>
  );

}
