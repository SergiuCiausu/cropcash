'use client';
/* One dated thing from the plan: what it is, when, how much, and what can be done with it. Calendar
   and Acasă show the same sheet. A ticked task goes through the outbox on a real farm, so it works
   offline; removing a followed call needs internet. */
import { useState } from 'react';
import { about, date, daysLeft, eurShort, exact, failText, zile } from '../../lib/cc/format';
import type { FarmView, PlanItem } from '../../lib/cc/plan';
import { useFarm, useMoney, useOnline, useStore } from '../../lib/cc/react';
import { NetButton, Sheet, useHref, Verify } from './bits';

export type SheetItem = Omit<PlanItem, 'icon'> & { follow?: boolean; url?: string; keys?: string[]; budgets?: (number | null | undefined)[] };

export const MONTH_NAMES = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
export const monthName = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[+m - 1]} ${y}`;
};

function explain(i: SheetItem) {
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

/** The facts about an item. `items`: everything else in the plan, for what arrives on the same day. */
export function ItemDetail({ item: i, items, view }: { item: SheetItem; items: SheetItem[]; view: FarmView }) {
  const { text: t } = useMoney();
  const when = i.exactDay ? date(i.date, true) : i.month ? monthName(i.month) : 'Fără termen';
  /* Everything planned to arrive on that day. Left out when the item's own Suma already says it. */
  const entering = i.exactDay ? items.filter((x) => x.exactDay && x.date === i.date && x.direction === 'in') : [];
  const dayTotal = entering.reduce((s, x) => s + x.value, 0);
  const sameAsSuma = i.direction === 'in' && dayTotal === i.value;
  const days_ = i.date && i.exactDay ? daysLeft(i.date, view.today) : -1;
  /* Red means something to do, so money on its way stays black. */
  const urgent = (i.task || i.follow) && days_ >= 0 && days_ <= view.data().params.opportunities_closing_soon_days.value;
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
}

/** What can be done with an item: tick a task, or stop following a call. */
export function ItemActions({ item: i, onDone }: { item: SheetItem; onDone: () => void }) {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  const onServer = !!farm.me;
  const isDone = farm.doneTasks.includes(i.id);
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
  const unfollow = () => store.setFollow(i.keys!, false) as Promise<void>;
  return (
    <>
      {i.task && (
        <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void run(() => store.setTaskDone(i.id, !isDone) as Promise<void>, (e) => failText(e, online))}>
          {isDone ? 'Nu am făcut încă' : 'Am făcut'}
        </button>
      )}
      {i.follow &&
        (onServer ? (
          <NetButton className="btn btn-dark" reason="Pornește internetul ca să schimbi calendarul." disabled={busy} onClick={() => void run(unfollow, (e) => (online ? failText(e, online) : 'Pornește internetul ca să schimbi calendarul.'))}>
            Scoate din calendar
          </NetButton>
        ) : (
          <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void run(unfollow, (e) => failText(e, online))}>
            Scoate din calendar
          </button>
        ))}
      {i.follow && (
        <a className="btn btn-line" href={href('/oportunitati')}>
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

export function ItemSheet({ item, items, view, onClose }: { item: SheetItem | null; items: SheetItem[]; view: FarmView; onClose: () => void }) {
  const online = useOnline();
  const onServer = !!useFarm()!.me;
  return (
    <Sheet open={!!item} onClose={onClose} className="detail" label={item?.title ?? 'Detalii'}>
      {item && (
        <>
          <div className="top">
            <div>
              <h2 tabIndex={-1} autoFocus>
                {item.title}
              </h2>
            </div>
            <button type="button" className="x" aria-label="Închide" onClick={onClose}>
              ×
            </button>
          </div>
          <ItemDetail item={item} items={items} view={view} />
          <div className="acts">
            <ItemActions key={item.id} item={item} onDone={onClose} />
            {!item.task && !item.follow && (
              <button type="button" className="btn btn-line" onClick={onClose}>
                Închide
              </button>
            )}
            {online || !(item.task || item.follow) ? null : <small>{onServer ? 'Ai nevoie de internet ca să salvezi.' : 'Se trimite când ai internet.'}</small>}
          </div>
        </>
      )}
    </Sheet>
  );
}
