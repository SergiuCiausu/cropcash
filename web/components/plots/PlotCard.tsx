'use client';
/* A parcel's card on /harta (docs/harta-plan.md, step 8): this year's crop and season, the work done and
   still to do, its money with what was shared out by area said plainly, and the crops of past years.
   It shows only; the page does the writes (it knows the store and reloads the parcels after). */
import { useState } from 'react';
import type { Crop } from '../../../packages/shared/src/data/index';
import { monthIndex, type PlotRow, type StoredSeason, type TodoItem } from '../../../packages/shared/src/plots/index';
import { date, exact, failText } from '../../lib/cc/format';
import { useMoney, useOnline } from '../../lib/cc/react';
import { expenseLabel } from '../../lib/ui/categories';
import { ErrorLine, NetButton } from '../app/bits';
import { kindLabel, landUseLabel } from './filter-text';
import { CropIcon } from './PlotList';
import { areaText, dueText, harvestText, perHaText, plotName, signed, sowingText } from './plot-text';

/** Who can change this parcel: the farmer's own on the server, or no one (Ion's example, a farm only on the phone). */
export type CardWrites = 'yes' | 'ion' | 'phone';

export interface PlotCardProps {
  row: PlotRow;
  /** Every season of this parcel, for „Istoric”. */
  history: readonly StoredSeason[];
  crops: ReadonlyMap<string, Pick<Crop, 'id' | 'genus' | 'kind'>>;
  cropName: (id: string) => string;
  /** The village or commune, when known. */
  place: string | null;
  today: string;
  writes: CardWrites;
  onClose: () => void;
  onAddWork: () => void;
  onExpense: () => void;
  onDraw: () => void;
  /** Throws to show why it failed. */
  onMarkDone: (item: TodoItem) => Promise<void>;
  /** For the hectares that aren't on the map yet: read the cerere. */
  onCerere: () => void;
}

/* Work and drawings wait in the queue without internet (docs/harta-plan.md step 11). */
const WAITING = ' · se trimite când ai internet';

/** Where today sits between sowing and harvest, as shares of the bar. Null without both months. */
export function seasonBar(row: Pick<PlotRow, 'sowing' | 'harvest'>, today: string): { now: number; done: boolean } | null {
  if (!row.sowing || !row.harvest) return null;
  const from = monthIndex(row.sowing.month);
  const to = monthIndex(row.harvest.month);
  if (to <= from) return null;
  const now = monthIndex(today.slice(0, 7));
  return { now: Math.min(1, Math.max(0, (now - from) / (to - from))), done: row.harvest.state === 'harvested' };
}

export function PlotCard(props: PlotCardProps) {
  const { row, cropName, today, writes, onClose } = props;
  const { text: t } = useMoney();
  const cropId = row.season?.crop_id ?? null;
  const unplacedHectares = !!row.plot.auto_crop_id;
  const bar = seasonBar(row, today);
  const where = [row.plot.bloc_fizic ? `Blocul fizic ${row.plot.bloc_fizic}` : null, row.plot.parcel_no ? `parcela ${row.plot.parcel_no}` : null, props.place, row.plot.land_use ? landUseLabel(row.plot.land_use) : null]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="pc" aria-labelledby="pc-title">
      <header className="pc-head">
        <CropIcon crop={cropId ? props.crops.get(cropId) : undefined} />
        <div>
          <h2 id="pc-title" tabIndex={-1}>
            {plotName(row.plot, cropName)}
          </h2>
          <p>{[cropId && !unplacedHectares ? cropName(cropId) : cropId ? null : 'Nimic semănat anul ăsta', areaText(row.season?.area_ari)].filter(Boolean).join(' · ')}</p>
          {where && <p className="pc-where">{where}</p>}
        </div>
        <button type="button" className="x" aria-label="Închide fișa parcelei" onClick={onClose}>
          ×
        </button>
      </header>

      {unplacedHectares && (
        <section className="pc-sec pc-unplaced">
          <p>Hectarele astea nu au încă loc pe hartă. Le pui din cererea de plată APIA: citim tabelul cu parcele și găsim blocurile.</p>
          {writes === 'yes' && (
            <NetButton className="btn btn-dark" reason="Ca să citim cererea ai nevoie de internet." onClick={props.onCerere}>
              Pune parcelele din cererea APIA
            </NetButton>
          )}
        </section>
      )}

      {row.season && (
        <section className="pc-sec">
          <h3>Sezonul</h3>
          <ul className="pc-facts">
            {sowingText(row.sowing, today) && <li>{cap(sowingText(row.sowing, today)!)}</li>}
            {harvestText(row.harvest) && <li>{cap(harvestText(row.harvest)!)}</li>}
          </ul>
          {bar && (
            <div className="pc-bar" role="img" aria-label={bar.done ? 'Recoltat' : `Sezonul e ${Math.round(bar.now * 100)}% trecut`}>
              <span className="pc-bar-fill" style={{ width: `${bar.done ? 100 : bar.now * 100}%` }} />
              <span className="pc-bar-ends">
                <small>Semănat</small>
                <small>Recoltă</small>
              </span>
            </div>
          )}
        </section>
      )}

      {row.season && <Work {...props} />}
      {row.money && <Money row={row} cropName={cropName} t={t} />}
      <History history={props.history} year={row.season?.harvest_year ?? null} cropName={cropName} />

      {writes === 'yes' && !unplacedHectares && (
        <footer className="pc-acts">
          <button type="button" className="btn btn-dark" onClick={props.onExpense}>
            Adaugă cheltuială aici
          </button>
          <button type="button" className="btn btn-line" onClick={props.onDraw}>
            {row.plot.geometry ? 'Mută sau desenează pe hartă' : 'Desenează pe hartă'}
          </button>
        </footer>
      )}
      {writes === 'ion' && <p className="note pc-note">Pe ferma lui Ion te uiți doar. Pe ferma ta notezi lucrări și cheltuieli pe fiecare parcelă.</p>}
    </article>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Work({ row, today, writes, onAddWork, onMarkDone }: PlotCardProps) {
  const online = useOnline();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { done, todo } = row.operations;
  const keyOf = (i: TodoItem) => i.operationId ?? `t:${i.templateId}`;
  async function mark(i: TodoItem) {
    setBusy(keyOf(i));
    setErr(null);
    try {
      await onMarkDone(i);
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="pc-sec">
      <h3>Lucrări</h3>
      {!done.length && !todo.length && <p className="pc-empty">Nicio lucrare notată anul ăsta.</p>}
      {todo.length > 0 && (
        <ul className="pc-work">
          {todo.map((i) => (
            <li key={keyOf(i)} className={i.overdue ? 'late' : undefined}>
              <span>
                <strong>{kindLabel(i.kind)}</strong>
                <small>
                  {i.overdue ? `Întârziat, trebuia ${dueText(i, today)}` : `De făcut ${dueText(i, today)}`}
                  {!i.operationId ? ' · lucrare obișnuită pentru cultura asta' : ''}
                </small>
              </span>
              {writes === 'yes' && (
                <button type="button" className="btn btn-line btn-sm" disabled={busy !== null} onClick={() => void mark(i)}>
                  {busy === keyOf(i) ? 'Se notează…' : 'Marchează făcut'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <ul className="pc-work">
          {done.map((o) => (
            <li key={o.id} className="done">
              <span>
                <strong>
                  <span aria-hidden="true">✓ </span>
                  {kindLabel(o.kind)}
                  {o.product ? `: ${o.product}` : ''}
                </strong>
                <small>
                  Făcut{o.on_date ? ` pe ${date(o.on_date, true)}` : ''}
                  {o.dose ? `, ${o.dose}` : ''}
                  {o.pending ? WAITING : ''}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine>{err}</ErrorLine>
      {writes === 'yes' && (
        <button type="button" className="btn btn-line" onClick={onAddWork}>
          Adaugă lucrare
        </button>
      )}
    </section>
  );
}

function Money({ row, cropName, t }: { row: PlotRow; cropName: (id: string) => string; t: (s: string) => string }) {
  const m = row.money!;
  const crop = row.season?.crop_id ? cropName(row.season.crop_id).toLocaleLowerCase('ro') : null;
  const categories = Object.entries(m.expenses.byCategory).filter(([, v]) => v !== 0);
  const perHa = perHaText(row);
  const nothing = m.expenses.total === 0 && m.revenue.total === 0;
  return (
    <section className="pc-sec">
      <h3>Bani</h3>
      {nothing ? (
        <p className="pc-empty">Nicio cheltuială sau vânzare pentru parcela asta anul ăsta.</p>
      ) : (
        <dl className="pc-money">
          {categories.map(([k, v]) => (
            <div key={k}>
              <dt>{expenseLabel(k) ?? 'Altele'}</dt>
              <dd>{t(`${exact(v)} lei`)}</dd>
            </div>
          ))}
          <div className="sum">
            <dt>Cheltuieli</dt>
            <dd>{t(`${exact(m.expenses.total)} lei`)}</dd>
          </div>
          <div className="sum">
            <dt>Venit</dt>
            <dd>{t(`${exact(m.revenue.total)} lei`)}</dd>
          </div>
          <div className={`total ${m.result < 0 ? 'neg' : 'pos'}`}>
            <dt>Rezultat</dt>
            <dd>
              {t(signed(m.result))}
              {perHa && <small>{t(perHa)}</small>}
            </dd>
          </div>
        </dl>
      )}
      {m.expenses.sharedCrop > 0 && crop && <p className="pc-shared">{t(`${exact(m.expenses.sharedCrop)} lei sunt împărțiți pe suprafață din cheltuielile pe ${crop}.`)}</p>}
      {m.expenses.sharedFarm > 0 && <p className="pc-shared">{t(`${exact(m.expenses.sharedFarm)} lei sunt împărțiți pe suprafață din cheltuielile fermei.`)}</p>}
      {m.revenue.sharedCrop > 0 && crop && <p className="pc-shared">{t(`${exact(m.revenue.sharedCrop)} lei de venit sunt împărțiți pe suprafață din vânzările de ${crop}.`)}</p>}
    </section>
  );
}

function History({ history, year, cropName }: { history: readonly StoredSeason[]; year: number | null; cropName: (id: string) => string }) {
  const past = [...history].filter((s) => s.harvest_year !== year).sort((a, b) => b.harvest_year - a.harvest_year);
  if (!past.length) return null;
  return (
    <section className="pc-sec">
      <h3>Istoric</h3>
      <ul className="pc-history">
        {past.map((s) => (
          <li key={s.harvest_year}>
            <span>Recolta {s.harvest_year}</span>
            <span>
              {s.crop_id ? cropName(s.crop_id) : 'Nimic semănat'} · {areaText(s.area_ari)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
