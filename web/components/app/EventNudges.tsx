'use client';
/* On Acasă: what the farmer asked to be reminded of, planned sums whose day passed („Ai plătit?”), and
   work planned on a parcel that is due soon or late (docs/harta-plan.md step 10), which opens that
   parcel on Harta. Until notifications exist (10-plan 9f), this is where reminders show. Works offline:
   the parcels come from the copy on the phone when there's no internet. */
import { useContext, useState } from 'react';
import { addDays, awaitingAnswer, dueReminders, eventItems, type Occurrence, type StoredEvent } from '../../../packages/shared/src/calendar/events';
import { date, exact } from '../../lib/cc/format';
import { useFarm, useMoney, useView } from '../../lib/cc/react';
import { Sheet } from './bits';
import { EventActions, EventFacts } from './EventActions';
import { EventSheet } from './EventSheet';
import '../../styles/events.css';
import { loadPlotsParams, upcomingWork } from '../../../packages/shared/src/plots/index';
import { appHref } from '../../lib/paths';
import { FrameContext } from './context';
import { PageLink } from './Frame';
import { kindLabel } from '../plots/filter-text';
import { dueText, plotName } from '../plots/plot-text';
import { usePlots } from '../plots/usePlots';

const SOON_DAYS = loadPlotsParams().todo_soon_days.value;

export function EventNudges() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const { text: t } = useMoney();
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<{ event: StoredEvent; originalDate: string } | null>(null);
  const today = view.today;
  const carry = view.data().params.farmer_events.carry_days.value;
  const ask = awaitingAnswer(farm.events, today, carry);
  const remind = dueReminders(eventItems(farm.events, [], [], [], today, addDays(today, 60)), today).filter((i) => i.occurrence);
  const { mode } = useContext(FrameContext);
  const plots = usePlots(view.baseYear).plots;
  const work = plots ? upcomingWork(plots.operations, plots.plots, today, SOON_DAYS) : [];
  if (!ask.length && !remind.length && !work.length) return null;
  const workRows = work.map(({ operation: o, daysLeft }) => {
    const p = plots!.plots.find((x) => x.id === o.plot_id)!;
    const due = dueText({ due: o.on_date }, today);
    return {
      id: o.id,
      href: appHref(`/harta?parcela=${encodeURIComponent(p.id)}`, mode),
      text: `${kindLabel(o.kind)}${o.product ? ` (${o.product})` : ''} pe ${plotName(p, view.cropName)}`,
      sub: daysLeft < 0 ? `Întârziat, ${due}` : due.charAt(0).toUpperCase() + due.slice(1),
      late: daysLeft < 0,
    };
  });

  const rows = [
    ...ask.map((o) => ({ o, text: `${o.event.direction === 'in' ? 'Ai primit banii' : 'Ai plătit'}: ${o.title}?`, sub: t(`${o.amount != null ? `${exact(o.amount)} lei, ` : ''}pe ${date(o.date)}`) })),
    ...remind.map((i) => ({ o: i.occurrence!, text: i.title, sub: i.date === today ? 'Azi' : `Pe ${date(i.date!, true)}` })),
  ];
  return (
    <section className="card ev-nudges" aria-labelledby="ev-nudges-h">
      <p className="eyebrow" id="ev-nudges-h">
        Din calendarul tău
      </p>
      <div className="rows">
        {rows.map(({ o, text, sub }) => (
          <button key={o.id} type="button" className="crow" onClick={() => setOpen(o)}>
            <span className="r-main">
              <b>{text}</b>
              <small>{sub}</small>
            </span>
          </button>
        ))}
        {workRows.map((w) => (
          <PageLink key={w.id} path="/harta" href={w.href} className={`crow${w.late ? ' late' : ''}`}>
            <span className="r-main">
              <b>{w.text}</b>
              <small>{w.sub}</small>
            </span>
          </PageLink>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} className="detail" label={open?.title ?? 'Detalii'}>
        {open && (
          <>
            <div className="top">
              <h2 tabIndex={-1} autoFocus>
                {open.title}
              </h2>
              <button type="button" className="x" aria-label="Închide" onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
            <EventFacts occ={open} />
            <div className="acts">
              <EventActions occ={open} onDone={() => setOpen(null)} onEdit={(event, originalDate) => (setOpen(null), setEditing({ event, originalDate }))} />
            </div>
          </>
        )}
      </Sheet>
      <EventSheet open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
