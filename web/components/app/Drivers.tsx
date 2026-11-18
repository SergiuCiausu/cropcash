'use client';
/* „Ce schimbă cel mai mult prognoza” (docs/calendar-events-plan.md, Part B): every income and cost
   in the next 12 months, largest effect on the salary first. Each one is measured by leaving it out
   of the plan, so a sum after the hardest month honestly shows a small effect. Pure calculation on
   the phone, so it works offline. The farmer's own sums open their event, to change it right here. */
import { useMemo, useState } from 'react';
import { planDrivers, type Driver } from '../../../packages/shared/src/cashflow/drivers';
import { seriesDates, type StoredEvent } from '../../../packages/shared/src/calendar/events';
import { date } from '../../lib/cc/format';
import { useFarm, useMoney, useView } from '../../lib/cc/react';
import { Verify } from './bits';
import { EventSheet } from './EventSheet';
import { monthName } from './ItemSheet';
import '../../styles/events.css';

type Filter = 'all' | 'in' | 'out' | 'unsure';
const FILTERS: [Filter, string][] = [
  ['all', 'Toate'],
  ['in', 'Intră'],
  ['out', 'Ies'],
  ['unsure', 'Cele mai nesigure'],
];

export function Drivers({ id = 'ce-conteaza' }: { id?: string }) {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const { lei } = useMoney();
  const [filter, setFilter] = useState<Filter>('all');
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<{ event: StoredEvent; originalDate: string } | null>(null);
  const data = view.data();
  const params = data.params.farmer_events;
  const plan = view.farmPlan();
  const fixed = plan.salaryFixed != null;
  const cropId = view.crop?.id ?? null;

  const byEffect = useMemo(() => planDrivers(plan, data, { cropId }), [plan, data, cropId]);
  const byUnsure = useMemo(() => planDrivers(plan, data, { cropId, order: 'unsure' }).filter((d) => d.spread > 0), [plan, data, cropId]);
  const list = filter === 'unsure' ? byUnsure : byEffect.filter((d) => filter === 'all' || d.direction === filter);
  const shown = all ? list : list.slice(0, params.drivers_first_rows.value);
  const main = (d: Driver) => (filter === 'unsure' ? d.spread : fixed ? d.lowestEffect : d.salaryEffect);
  const top = Math.max(1, ...list.map((d) => Math.abs(main(d))));
  const small = params.drivers_small_lei.value * 100;

  const crop = (id: string | null) => (id ? view.cropName(id).toLowerCase() : '');
  const name = (d: Driver) => {
    switch (d.kind) {
      case 'apia_advance':
        return 'Avansul de la APIA';
      case 'apia_balance':
        return 'Restul de la APIA';
      case 'crop_sale':
        return `Vânzarea: ${crop(d.cropId)}`;
      case 'stored_grain':
        return `Din hambar: ${crop(d.cropId)}`;
      case 'crop_cost':
        return `Cheltuieli la ${crop(d.cropId)}`;
      case 'credit':
        return 'Creditul';
      case 'loan_repayment':
        return 'Creditul dat înapoi';
      case 'payroll':
        return 'Salariile oamenilor';
      case 'rent':
        return 'Arenda pe care o dai';
      case 'rent_in':
        return 'Arenda pe care o primești';
      default:
        return `${d.title ?? 'Suma ta'}${d.cropId ? `, ${crop(d.cropId)}` : ''}`;
    }
  };
  const when = (d: Driver) =>
    d.count > 1 ? `De ${d.count} ori, din ${monthName(d.firstDate.slice(0, 7)).toLowerCase()} până în ${monthName(d.lastDate.slice(0, 7)).toLowerCase()}` : d.firstDate.slice(8) === '15' && d.kind !== 'farmer' ? `În ${monthName(d.firstDate.slice(0, 7)).toLowerCase()}` : `Pe ${date(d.firstDate, true)}`;

  const effectText = (d: Driver) => {
    if (filter === 'unsure') return { big: `±${lei(Math.round(d.spread / 2))}`, small: 'între anul slab și cel bun' };
    if (fixed) return { big: `${d.lowestEffect > 0 ? '+' : d.lowestEffect < 0 ? '−' : ''}${lei(Math.abs(d.lowestEffect))}`, small: 'la cel mai jos' };
    if (Math.abs(d.salaryEffect) < small) return { big: 'puțin', small: 'pe salariu' };
    return { big: `${d.salaryEffect > 0 ? '+' : '−'}${lei(Math.abs(d.salaryEffect))}`, small: 'pe lună, la salariu' };
  };
  const why = (d: Driver) => {
    const total = `${d.direction === 'in' ? 'Intră' : 'Ies'} ${lei(d.total)} în 12 luni.`;
    if (filter === 'unsure') return `${total} Într-un an slab sau bun poate fi cu ${lei(Math.round(d.spread / 2))} mai puțin sau mai mult.`;
    const more = d.direction === 'in' ? 'mai mic' : 'mai mare';
    const salary = Math.abs(d.salaryEffect) < small
      ? d.afterHardest
        ? 'Vine după luna cea mai grea, așa că schimbă puțin salariul.'
        : 'Schimbă puțin salariul.'
      : `Fără ea, salariul sigur ar fi cu ${lei(Math.abs(d.salaryEffect))} ${more} pe lună.`;
    if (!fixed) return `${total} ${salary}`;
    const low = d.lowestEffect === 0 ? 'Nu schimbă cel mai jos punct.' : `Fără ea, cel mai jos ai avea cu ${lei(Math.abs(d.lowestEffect))} ${d.lowestEffect > 0 ? 'mai puțin' : 'mai mult'}.`;
    return `${total} ${low} Salariul tău e fixat. ${salary}`;
  };
  const openEvent = (d: Driver) => {
    const ev = farm.events.find((e) => e.id === d.eventId);
    if (!ev) return;
    const next = seriesDates(ev, view.today, `${+view.today.slice(0, 4) + 2}-12-31`)[0] ?? ev.starts_on;
    setEditing({ event: ev, originalDate: next });
  };

  const row = (d: Driver) => {
    const e = effectText(d);
    const m = main(d);
    const body = (
      <>
        <span className="d-name">
          {name(d)}
          {d.own && <span className="tag">suma ta</span>}
          {d.unsure && filter !== 'unsure' && <span className="tag">nesigură</span>}
          {d.unverified && <Verify />}
        </span>
        <span className="d-when">{when(d)}</span>
        <span className={`d-effect${m > 0 && filter !== 'unsure' ? ' pos' : m < 0 ? ' neg' : ''}`}>
          {e.big}
          <small>{e.small}</small>
        </span>
        <span className="d-bar" aria-hidden="true">
          <i className={m < 0 ? 'neg' : ''} style={{ width: `${Math.max(2, Math.round((Math.abs(m) * 100) / top))}%` }} />
        </span>
        <span className="d-why">{why(d)}</span>
      </>
    );
    return (
      <li key={d.key}>
        {d.kind === 'farmer' ? (
          <button type="button" className="d-row" onClick={() => openEvent(d)} aria-label={`${name(d)}. Schimbă suma`}>
            {body}
          </button>
        ) : (
          <div className="d-row">{body}</div>
        )}
      </li>
    );
  };

  return (
    <section className="card drivers" id={id} aria-labelledby={`${id}-h`}>
      <div className="d-head">
        <h2 id={`${id}-h`}>{fixed ? 'Ce schimbă cel mai mult cel mai jos punct' : 'Ce schimbă cel mai mult salariul'}</h2>
      </div>
      <p className="note">
        {fixed
          ? 'Ai fixat salariul, așa că arătăm cât de jos ar coborî banii fără fiecare sumă. Lângă fiecare scrie și cât ar schimba salariul sigur.'
          : 'Fiecare sumă din următoarele 12 luni, de la cea care schimbă cel mai mult salariul sigur. Am socotit planul fără ea și am văzut cu cât se schimbă salariul.'}
      </p>
      <div className="vtabs" role="group" aria-label="Ce arăt">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={f === filter} onClick={() => (setFilter(f), setAll(false))}>
            {label}
          </button>
        ))}
      </div>
      {list.length ? (
        <ol>{shown.map(row)}</ol>
      ) : (
        <p className="empty">{filter === 'unsure' ? 'Nicio sumă nu se schimbă de la un an la altul.' : 'Încă nu sunt sume în plan.'}</p>
      )}
      {list.length > shown.length && (
        <button type="button" className="btn btn-line more" onClick={() => setAll(true)}>
          Arată toate ({list.length})
        </button>
      )}
      <p className="note gap">Rândurile nu se adună: fiecare arată ce s-ar întâmpla doar fără suma aceea.</p>
      <EventSheet open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}
