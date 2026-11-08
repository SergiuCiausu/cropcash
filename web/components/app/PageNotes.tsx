'use client';
/* Notes a page can carry: a later harvest is an estimate (app.js futureNote()), and a closed project
   shows only its plan against what happened (app.js closedView()). */
import { useContext } from 'react';
import type { FarmView } from '../../lib/cc/plan';
import { useMoney, useStore, useView } from '../../lib/cc/react';
import { Verify } from './bits';
import { FrameContext } from './context';
import { NetBanner } from './NetBanner';
import { PageLink } from './Frame';

/** Put right after the page header. Only a later, open harvest on a picker page is an estimate. */
export function FutureNote() {
  const { scope } = useContext(FrameContext);
  const view = useView(scope);
  if (!view?.future) return null;
  return (
    <p className="offline">
      {view.projectName(view.selected, view.selectedCrop)} e o estimare: folosim sumele și datele din 2026. <Verify />
    </p>
  );
}

/** The "Plan și realitate" table, for a harvest or one crop in it. `realLabel` is "Real" or "Până acum". */
export function CompareTable({ view, harvestId, cropId, realLabel }: { view: FarmView; harvestId: string; cropId: string | null; realLabel: string }) {
  const money = useMoney();
  const h = view.harvests.items.find((x) => x.id === harvestId)!;
  const { closed, rows, note } = view.compare(h, cropId);
  return (
    <>
      <table className="crop-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">Plan</th>
            <th scope="col">{realLabel}</th>
            {closed && <th scope="col">Diferență</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td data-l="Plan">{money.signed(r.planned)}</td>
              <td data-l={realLabel}>{money.signed(r.real)}</td>
              {closed && <td data-l="Diferență">{money.signed(r.real - r.planned)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="note gap">{note}</p>}
    </>
  );
}

/** A finished harvest shows what happened: the engine can't rebuild a year before its calendar. */
export function ClosedView({ view }: { view: FarmView }) {
  const store = useStore();
  const { href } = useContext(FrameContext);
  const whole = view.selectedCrop && view.selected.status === 'open';
  const next = whole ? view.selected : view.nextOpen;
  return (
    <div>
      <NetBanner />
      <header className="page-h">
        <div>
          <h1>{view.projectName(view.selected, view.selectedCrop)}</h1>
          <p className="lead">Recolta e încheiată. Aici vezi planul și ce s-a întâmplat.</p>
        </div>
      </header>
      <section className="card">
        <div className="card-h">
          <h2>Plan și realitate</h2>
        </div>
        <CompareTable view={view} harvestId={view.selected.id} cropId={view.selectedCrop} realLabel="Real" />
      </section>
      <div className="ob-actions">
        <PageLink path="/recolte" href={href('/recolte')} className="btn btn-dark">
          Vezi recolta
        </PageLink>
        {next && (
          <button type="button" className="btn btn-line" onClick={() => store?.selectHarvest(next.id)}>
            Mergi la {view.projectName(next)}
          </button>
        )}
      </div>
    </div>
  );
}
