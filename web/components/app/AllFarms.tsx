'use client';
/* „Toate fermele” on Contracte (docs/contracts-plan.md §6, step 7): every farm the person owns, manages or keeps the
   books for, from GET /api/farms/contracts-summary. Internet only: the phone holds one farm's copy, so the total
   can't be built offline (§6.3 waits for per-farm storage). What was fetched stays on screen if the net drops. */
import { useCallback, useEffect, useState } from 'react';
import type { CrossFarmSummary } from '../../../packages/shared/src/contracts/totals';
import { kindName } from '../../lib/cc/contracts';
import { date, exact, ha } from '../../lib/cc/format';
import { useOnline, useStore, useView } from '../../lib/cc/react';
import { monthName } from './ItemSheet';

export type AllFarmsSummary = CrossFarmSummary & { missing: string[] };

const ROLE_WORDS = {
  owner: 'a ta',
  manager: 'administrezi',
  accountant: 'contabil',
} as const;

/** The summary, fetched when there's internet. `reload` asks again (when the person opens „Toate fermele”). */
export function useAllFarms(enabled: boolean) {
  const store = useStore()!;
  const online = useOnline();
  const [summary, setSummary] = useState<AllFarmsSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !online) return;
    let live = true;
    store.live
      .api<AllFarmsSummary>('/api/farms/contracts-summary', { timeout: 'read' })
      .then((s) => {
        if (!live) return;
        // An answer without the farms (an older API) counts as not fetched.
        if (!Array.isArray(s?.farms) || !Array.isArray(s.missing)) return setFailed(true);
        setSummary(s);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [enabled, online, store, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { summary, failed, reload };
}

/** Two farms or more (one of them maybe unreadable): only then is there something to add up. */
export const severalFarms = (s: AllFarmsSummary | null) => !!s && s.farms.length + s.missing.length >= 2;

export function AllFarms({ summary, failed }: { summary: AllFarmsSummary | null; failed: boolean }) {
  const view = useView('farm')!;
  const data = view.data();
  const online = useOnline();
  const months = data.params.forecast.plan_months.value;
  if (!summary) return <p className="empty">{failed ? 'Nu am putut aduce fermele acum. Încearcă iar puțin mai târziu.' : 'Aducem fermele…'}</p>;
  const t = summary.total;
  const noArenda = summary.farms.filter((f) => !f.arenda).map((f) => f.name);

  return (
    <>
      {!online && <p className="note">Fără internet: cifrele sunt cele aduse ultima dată.</p>}
      <section className="card" aria-labelledby="af-sum">
        <h2 id="af-sum" className="sr-only">
          Toate fermele, pe scurt
        </h2>
        <dl className="ar-facts">
          <div>
            <dt>În vigoare</dt>
            <dd>{t.count}</dd>
          </div>
          <div>
            <dt>Primești, în {months} luni</dt>
            <dd>{exact(t.inBani)} lei</dd>
          </div>
          <div>
            <dt>Plătești, în {months} luni</dt>
            <dd>{exact(t.outBani)} lei</dd>
          </div>
          <div>
            <dt>Bani la stat</dt>
            <dd>{exact(t.taxes.toStateBani)} lei</dd>
          </div>
          {(t.takenAri > 0 || t.givenAri > 0) && (
            <div>
              <dt>Pământ în arendă</dt>
              <dd>
                {t.takenAri > 0 && `iei ${ha(t.takenAri)} ha`}
                {t.takenAri > 0 && t.givenAri > 0 && ', '}
                {t.givenAri > 0 && `dai ${ha(t.givenAri)} ha`}
              </dd>
            </div>
          )}
          {t.landowners > 0 && (
            <div>
              <dt>Proprietari</dt>
              <dd>{t.landowners}</dd>
            </div>
          )}
        </dl>
        {t.taxes.unknown > 0 && (
          <p className="note">Plus {t.taxes.unknown === 1 ? 'o sumă pe care n-o știm încă' : `${t.taxes.unknown} sume pe care nu le știm încă`}.</p>
        )}
        {t.landowners > 0 && summary.farms.length > 1 && <p className="note">Unii proprietari pot fi pe mai multe ferme: îi numărăm pe fiecare fermă.</p>}
        <p className="note">Taxele se plătesc pe fiecare fermă, de cine o are (firmă, PFA sau persoană). Totalul e ca să vezi tot, nu pentru declarații.</p>
        {summary.missing.length > 0 && <p className="note">Fără {summary.missing.join(', ')}: n-am putut-o citi acum.</p>}
        {noArenda.length > 0 && <p className="note">La {noArenda.join(', ')} ești contabil: arenda și forma fermei nu se văd, deci nu sunt în cifre.</p>}
      </section>

      <div className="bento">
        <section className="card s12" aria-labelledby="af-farms">
          <div className="card-h">
            <h2 id="af-farms">Pe fiecare fermă</h2>
          </div>
          <div className="rows">
            {summary.farms.map((f) => (
              <div key={f.farmId} className="row">
                <span className="r-main">
                  <b>
                    {f.name} <span className="tag n">{ROLE_WORDS[f.role]}</span>
                  </b>
                  <small>
                    {[
                      f.count === 1 ? 'un contract' : `${f.count} contracte`,
                      `primești ${exact(f.inBani)} lei`,
                      `plătești ${exact(f.outBani)} lei`,
                      f.takenAri > 0 ? `iei în arendă ${ha(f.takenAri)} ha` : '',
                      f.givenAri > 0 ? `dai în arendă ${ha(f.givenAri)} ha` : '',
                      f.due.length ? `de hotărât: ${f.due.length}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                <span className="r-side">
                  <b>{exact(f.taxes.toStateBani)} lei</b>
                  <small>la stat</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card s12" aria-labelledby="af-due">
          <div className="card-h">
            <h2 id="af-due">De hotărât, în 90 de zile</h2>
          </div>
          {summary.due.length === 0 ? (
            <p className="empty">Nimic de hotărât pe nicio fermă în următoarele 90 de zile.</p>
          ) : (
            <div className="rows">
              {summary.due.map((d) => (
                <div key={`${d.farmId}:${d.contractId}`} className="row">
                  <span className="r-main">
                    <b>{d.party || kindName(data, d.kind)}</b>
                    <small>
                      {kindName(data, d.kind)} · {d.farmName}
                    </small>
                  </span>
                  <span className="r-side">
                    <b>{d.day ? date(d.day, true) : 'fără dată'}</b>
                    {d.status === 'overdue' && <small>a trecut</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card s12" aria-labelledby="af-tax">
          <div className="card-h">
            <h2 id="af-tax">Bani la stat, lună de lună</h2>
          </div>
          {summary.taxMonths.length === 0 ? (
            <p className="empty">Contractele fermelor nu aduc taxe de plătit în lunile care urmează.</p>
          ) : (
            summary.taxMonths.map((m) => (
              <div key={m.month ?? 'x'} className="ar-village">
                <h3>
                  {m.month ? monthName(m.month) : 'Fără dată'} · {exact(m.totals.toStateBani)} lei
                  {m.totals.unknown > 0 ? `, plus ${m.totals.unknown === 1 ? 'o sumă necunoscută' : `${m.totals.unknown} sume necunoscute`}` : ''}
                </h3>
                <div className="rows">
                  {m.farms.map((f) => (
                    <div key={f.farmId} className="row">
                      <span className="r-main">
                        <b>{f.farmName}</b>
                      </span>
                      <span className="r-side">
                        <b>{exact(f.totals.toStateBani)} lei</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <p className="note">Sumele le socotește aplicația din contracte. Le confirmă contabilul fiecărei ferme.</p>
        </section>
      </div>
    </>
  );
}
