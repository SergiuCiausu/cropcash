'use client';
/* "Calendar": month grid, list_upcoming, get_event, list_tasks, complete_task, reopen_task, plus followed
   calls (was web/legacy/calendar.js). Money, work and official dates come from buildFarmPlan, so this
   page shows what the plan shows. A ticked task goes through the outbox on a real farm, so it works
   offline; on Ion's farm it stays on the phone. Removing a followed call needs internet. */
import { Fragment, useMemo, useState } from 'react';
import { about, date, daysLeft, eurShort, exact, failText, zile } from '../../lib/cc/format';
import { callName } from '../../lib/cc/monitor';
import type { PlanItem } from '../../lib/cc/plan';
import { useFarm, useMoney, useMonitor, useOnline, useStore, useView } from '../../lib/cc/react';
import type { IconName } from '../../lib/ui/icons';
import { CHEVRON, Icon, NetButton, OfflineNote, Sheet, useHref, Verify } from '../app/bits';
import { FutureNote } from '../app/PageNotes';
import { PageLink } from '../app/Frame';

const MONTH_NAMES = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const MONTH_SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const WEEKDAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const VIEWS: [Tab, string][] = [
  ['all', 'Tot'],
  ['money', 'Bani'],
  ['todo', 'De făcut'],
  ['work', 'Lucrări'],
];
type Tab = 'all' | 'money' | 'todo' | 'work';
const monthName = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[+m - 1]} ${y}`;
};
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

/** A plan entry or a followed call, as a row of the calendar. */
type Item = Omit<PlanItem, 'icon'> & { icon: IconName; follow?: boolean; url?: string; keys?: string[]; budgets?: (number | null | undefined)[] };

const FILTER: Record<Tab, (i: Item) => boolean> = {
  all: () => true,
  money: (i) => i.direction !== 'none',
  todo: (i) => !!i.task || !!i.follow,
  work: (i) => i.kind === 'input_cost',
};
const shade = (i: Item) => (i.direction === 'in' ? 'in' : i.direction === 'out' ? 'out' : 'task');
const chipText = (i: Item) => (i.direction === 'none' ? i.title : `${i.direction === 'in' ? '+' : '−'}${exact(i.value)}`);

function explain(i: Item) {
  const w = i.window;
  if (i.kind === 'apia_balance') return `Vine între ${date(w!.start)} și ${date(w!.end, true)}. Nu știm exact luna. Noi am socotit că vine abia pe ${date(w!.end)}, ca să fii acoperit.`;
  if (i.kind === 'apia_advance') return `Plățile se fac între ${date(w!.start)} și ${date(w!.end, true)}. Planul socotește cu ultima zi, ca să fii acoperit dacă banii vin târziu.`;
  if (i.kind === 'input_cost' || i.kind === 'crop_sale') return 'Suma și luna sunt estimate după culturile tale. Le poți schimba când ai cifrele tale.';
  if (i.follow) return 'Termenul vine de la sursa oficială.';
  if (i.estimated) return 'Termenul pentru anul viitor nu e anunțat. Am pus data de anul ăsta.';
  return '';
}

function Tile({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={className}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function Calendar() {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const monitor = useMonitor();
  const online = useOnline();
  const href = useHref();
  const { text: t } = useMoney();
  const TODAY = view.today;
  const crop = view.crop;
  const data = view.data();
  const plan = view.farmPlan();
  const timeline = plan.timelines.medium;
  const months = crop ? crop.months(timeline) : timeline.months;
  const onServer = !!farm.me;
  const done = useMemo(() => new Set(farm.doneTasks), [farm.doneTasks]);
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
    const list = months.flatMap((m) => m.entries.map((e) => view.planItem(e, m.key) as unknown as Item));
    return [...list, ...followed].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  }, [view, months, monitor.followed, crop, TODAY]);
  const isDone = (i: Item) => !!i.task && done.has(i.id);

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
  const detailBody = (i: Item) => {
    const when = i.exactDay ? date(i.date, true) : i.month ? monthName(i.month) : 'Fără termen';
    /* Everything planned to arrive on that day. Left out when the item's own Suma already says it. */
    const entering = i.exactDay ? items.filter((x) => x.exactDay && x.date === i.date && x.direction === 'in') : [];
    const dayTotal = entering.reduce((s, x) => s + x.value, 0);
    const sameAsSuma = i.direction === 'in' && dayTotal === i.value;
    const days_ = i.date && i.exactDay ? left(i.date) : -1;
    /* Red means something to do, so money on its way stays black. */
    const urgent = (i.task || i.follow) && days_ >= 0 && days_ <= data.params.opportunities_closing_soon_days.value;
    const source = (i.event as { source_url?: string } | null | undefined)?.source_url;
    const notes = [explain(i), (i.event as { note?: string } | null | undefined)?.note].filter(Boolean) as string[];
    return (
      <>
        <div className="key-facts">
          <Tile label="Când" value={when} sub={days_ >= 0 ? `mai sunt ${zile(days_)}` : ''} className={urgent ? 'soon' : undefined} />
          {i.direction !== 'none' && <Tile label="Suma" value={t(`${exact(i.value)} lei`)} sub={i.amount && i.amount.min !== i.amount.max ? t(`între ${about(i.amount.min)} și ${about(i.amount.max)} lei`) : ''} />}
          {/* The whole call's money, the same figure as on Oportunități, and not what this farm would get. */}
          {i.budgets?.every((b) => b != null) && <Tile label="Bani alocați" value={eurShort(i.budgets.reduce<number>((s, b) => s + (b as number), 0)) ?? ''} sub="pentru tot apelul" />}
          {i.exactDay && !sameAsSuma && <Tile label="Intră în ziua asta" value={t(`${exact(dayTotal)} lei`)} sub={dayTotal ? '' : 'nimic planificat'} />}
        </div>
        {i.unverified && (
          <p className="note gap">
            <Verify /> Verifică la instituție înainte să te bazezi pe această dată.
          </p>
        )}
        {notes.map((n) => (
          <p className="d-text" key={n}>
            {n}
          </p>
        ))}
        {source && (
          <p className="note gap">
            <a href={source} rel="noopener" target="_blank">
              Vezi sursa
            </a>
          </p>
        )}
      </>
    );
  };

  const actions = (i: Item, onDone: () => void) => <ItemActions key={i.id} item={i} done={done} onDone={onDone} onServer={onServer} store={store} online={online} oportunitati={href('/oportunitati')} />;

  /* ---- Green card: the next dated thing in full, then three numbers ---- */
  /* A later harvest starts in its own year, so today's deadlines don't lead its calendar. */
  const from = [TODAY, `${months[0].key}-01`].sort().pop()!;
  const next = items.find((i) => !isDone(i) && i.exactDay && i.date >= from);
  const soonTasks = items.filter((i) => (i.task || i.follow) && !isDone(i) && i.date && left(i.date) >= 0 && left(i.date) <= 30).length;
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
          {next && (next.task || next.follow) ? (
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
          : t(`Am pornit de la ${exact(view.farm.startBalanceBani)} lei în cont${farm.isIon ? ', ca în exemplul lui Ion' : ''}. Sumele de aici nu scad salariul de ${exact(plan.salary.salary)} lei și pensia de ${exact(view.pensionBani())} lei pe lună.${onServer ? '' : ' Apelurile urmărite sunt exemple pentru demo.'}`)}
      </p>{' '}
      <PageLink path="/prognoza" href={href('/prognoza')} className="btn btn-dark next-step">
        Mai departe: prognoza pe un an
      </PageLink>
      <Sheet open={!!item} onClose={() => setOpenId(null)} className="detail" label={item?.title ?? 'Detalii'}>
        {item && (
          <>
            <div className="top">
              <div>
                <h2 tabIndex={-1} autoFocus>
                  {item.title}
                </h2>
              </div>
              <button type="button" className="x" aria-label="Închide" onClick={() => setOpenId(null)}>
                ×
              </button>
            </div>
            {detailBody(item)}
            <div className="acts">
              {actions(item, () => setOpenId(null))}
              {!item.task && !item.follow && (
                <button type="button" className="btn btn-line" onClick={() => setOpenId(null)}>
                  Închide
                </button>
              )}
              {online || !(item.task || item.follow) ? null : <small>{onServer ? 'Ai nevoie de internet ca să salvezi.' : 'Se trimite când ai internet.'}</small>}
            </div>
          </>
        )}
      </Sheet>
    </>
  );

}

/** What can be done with an item: tick a task, or stop following a call. */
function ItemActions({ item: i, done, onDone, onServer, store, online, oportunitati }: { item: Item; done: Set<string>; onDone: () => void; onServer: boolean; store: NonNullable<ReturnType<typeof useStore>>; online: boolean; oportunitati: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, fail: (e: unknown) => string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setBusy(false);
      onDone();
    } catch (e) {
      setBusy(false);
      setError(fail(e));
    }
  };
  return (
    <>
      {i.task && (
        <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void run(() => store.setTaskDone(i.id, !done.has(i.id)) as Promise<void>, (e) => failText(e, online))}>
          {done.has(i.id) ? 'Nu am făcut încă' : 'Am făcut'}
        </button>
      )}
      {i.follow &&
        (onServer ? (
          <NetButton className="btn btn-dark" reason="Pornește internetul ca să schimbi calendarul." disabled={busy} onClick={() => void run(() => store.setFollow(i.keys!, false) as Promise<void>, (e) => (online ? failText(e, online) : 'Pornește internetul ca să schimbi calendarul.'))}>
            Scoate din calendar
          </NetButton>
        ) : (
          <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void run(() => store.setFollow(i.keys!, false) as Promise<void>, (e) => failText(e, online))}>
            Scoate din calendar
          </button>
        ))}
      {i.follow && (
        <a className="btn btn-line" href={oportunitati}>
          Vezi oportunitățile
        </a>
      )}
      {error && (
        <small className="send-failed" role="alert">
          {error}
        </small>
      )}
    </>
  );
}
