'use client';
/* "De raportat": what the farmer must file at APIA and at the primărie, by when, and what to bring.
   Shared by /de-raportat and /ferma-lui-ion/de-raportat (screens/de-raportat.tsx). Everything comes
   from docs/data and the records on the phone, so it works without internet; only the links to the
   official pages need it. The diesel card counts the litres noted on diesel expenses in Recolte. */
import { createContext, useContext, useMemo, useState } from 'react';
import type { ObligationItem, ObligationRule } from '../../../packages/shared/src/obligations/index';
import { date, daysLeft, exact, zile } from '../../lib/cc/format';
import { farmObligations, FUEL, type FarmObligations } from '../../lib/cc/obligations';
import { useFarm, useMoney, useView } from '../../lib/cc/react';
import { litres } from '../../lib/reports/format';
import { useHref, Verify } from '../app/bits';
import { PageLink } from '../app/Frame';
import { isReportId, ReportSheet } from '../reports/ReportSheet';
import type { ReportId } from '../../lib/reports/build';
import '../../styles/obligations.css';

/** Opens a report in a sheet on this page, instead of going to /rapoarte. */
const OpenReport = createContext<(id: ReportId) => void>(() => undefined);

const ROMAN = ['I', 'II', 'III', 'IV'];
const quarterName = (key: string) => `trimestrul ${ROMAN[+key.slice(-1) - 1]} din ${key.slice(0, 4)}`;

function Source({ url, children = 'Vezi sursa' }: { url: string | null; children?: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** "în 12 zile", "azi", "a trecut". */
function whenText(days: number) {
  if (days < 0) return 'a trecut';
  if (days === 0) return 'azi';
  return `în ${zile(days)}`;
}

function DieselCard({ ob, today }: { ob: FarmObligations; today: string }) {
  const href = useHref();
  const openReport = useContext(OpenReport);
  const { text: t } = useMoney();
  const f = ob.fuel;
  const lei = (bani: number) => t(`${exact(bani)} lei`);

  if (f.schemeEnded) {
    return (
      <section className="card s7" aria-labelledby="ob-diesel">
        <div className="card-h">
          <h2 id="ob-diesel">Motorina</h2>
        </div>
        <p className="note">
          Ajutorul la motorină a mers până pe {date(FUEL.scheme_end.value, true)}. APIA n-a anunțat încă dacă îl continuă. Când apare ceva, îl punem aici.
        </p>
        <p className="note">
          Pentru motorina din {quarterName(`${FUEL.scheme_end.value.slice(0, 4)}-Q4`)} poți cere banii până pe{' '}
          {date(FUEL.claims.find((c) => c.period === `${FUEL.scheme_end.value.slice(0, 4)}-Q4`)?.deadline ?? FUEL.scheme_end.value, true)}.
        </p>
      </section>
    );
  }

  const days = f.claim ? daysLeft(f.claim.deadline, today) : null;
  return (
    <section className="card s7" aria-labelledby="ob-diesel">
      <div className="card-h">
        <h2 id="ob-diesel">Motorina, {quarterName(f.quarter.key)}</h2>
      </div>
      <p className="note">Statul îți dă înapoi o parte din acciza de pe motorina folosită la câmp. Ceri banii la APIA după fiecare trimestru, cu facturile.</p>
      <ul className="ob-facts">
        <li>
          <span>Litri notați în trimestrul ăsta</span>
          <b>{litres(f.litresCl)}</b>
        </li>
        <li className="strong">
          <span>Acciză de primit înapoi, cam</span>
          <b>
            {lei(f.refundBani)} {f.unverified && <Verify />}
          </b>
        </li>
        {f.claim && (
          <li>
            <span>Ceri banii până pe</span>
            <b>
              {date(f.claim.deadline, true)}
              {days !== null && days >= 0 ? `, ${whenText(days)}` : ''}
            </b>
          </li>
        )}
        {f.capCl !== null && (
          <li>
            <span>Cât ai notat anul ăsta, din cât poți cere</span>
            <b>
              {litres(f.yearLitresCl)} din {litres(f.capCl)}
            </b>
          </li>
        )}
      </ul>
      {f.missing.length > 0 && (
        <p className="ob-warn">
          {f.missing.length === 1 ? 'O cheltuială pe motorină nu are' : `${f.missing.length} cheltuieli pe motorină nu au`} litrii notați, deci nu intră în sumă. Îi scrii în{' '}
          <PageLink path="/recolte" href={href('/recolte')}>
            Recolte
          </PageLink>
          , la „Mai multe detalii”.
        </p>
      )}
      {f.noRate.length > 0 && (
        <p className="ob-warn">
          {f.noRate.length === 1 ? 'Un bon e' : `${f.noRate.length} bonuri sunt`} din zile pentru care nu se știe încă cât e acciza. Nu intră în sumă până nu aflăm.
        </p>
      )}
      {f.overCap && <p className="ob-warn">Ai notat mai mulți litri decât îți dă legea pentru culturile tale. Peste plafon, APIA nu plătește.</p>}
      {ob.uncapped.length > 0 && <p className="note">Pentru {ob.uncapped.join(', ').toLocaleLowerCase('ro')} legea nu dă litri de motorină.</p>}
      {f.rates.length > 1 && (
        <p className="note">Acciza s-a schimbat în trimestrul ăsta, așa că fiecare bon e socotit cu cota din ziua în care ai cumpărat.</p>
      )}
      <h3 className="ob-sub">Ce duci la APIA</h3>
      <ul className="ob-docs">
        {FUEL.claim_documents_ro.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="note">{FUEL.how_ro}</p>
      <p className="note">{FUEL.payment_ro}</p>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" onClick={() => openReport('fuel-excise')}>
          Fă situația motorinei (PDF)
        </button>
        <Source url={FUEL.legal_basis[0]!.url}>Legea (HG 1174/2014)</Source>
      </div>
    </section>
  );
}

function ItemBody({ item }: { item: ObligationItem }) {
  const openReport = useContext(OpenReport);
  const report = isReportId(item.report) ? item.report : null;
  return (
    <div className="ob-body">
      {item.start && item.start !== item.end && (
        <p>
          Se depune între {date(item.start, true)} și {date(item.end, true)}.
        </p>
      )}
      {item.note && <p>{item.note}</p>}
      {item.documentsRo.length > 0 && (
        <>
          <h3>Ce duci</h3>
          <ul>
            {item.documentsRo.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {item.howRo && (
        <>
          <h3>Unde</h3>
          <p>{item.howRo}</p>
        </>
      )}
      <p>
        {report && (
          <>
            <button type="button" className="ob-link" onClick={() => openReport(report)}>
              Pregătește actele în Rapoarte
            </button>
            {item.sourceUrl ? ' · ' : ''}
          </>
        )}
        <Source url={item.sourceUrl} />
      </p>
    </div>
  );
}

function ItemList({ items, soonDays, empty }: { items: ObligationItem[]; soonDays: number; empty: string }) {
  if (!items.length) return <p className="note">{empty}</p>;
  return (
    <ol className="ob-list">
      {items.map((i) => (
        <li key={i.key}>
          <details className="ob-item">
            <summary>
              <span>
                <b>{i.titleRo}</b>
                <small>
                  {i.authority === 'APIA' ? 'La APIA' : `La ${i.authority}`} · până pe {date(i.end, true)}
                  {i.estimated ? ', dată estimată după anul ăsta' : ''} {i.unverified && <Verify />}
                </small>
              </span>
              <span className={`ob-when${i.daysLeft <= soonDays ? ' soon' : ''}`}>{i.open ? whenText(i.daysLeft) : `din ${date(i.start!)}`}</span>
            </summary>
            <ItemBody item={i} />
          </details>
        </li>
      ))}
    </ol>
  );
}

function Rules({ rules }: { rules: ObligationRule[] }) {
  return (
    <section className="card s5" aria-labelledby="ob-rules">
      <div className="card-h">
        <h2 id="ob-rules">Dacă se întâmplă ceva</h2>
      </div>
      <ul className="ob-list">
        {rules.map((r) => (
          <li key={r.id} className="ob-body">
            <p>
              <b>{r.titleRo}</b>
            </p>
            <p>
              {r.note} {r.status === 'DE-VERIFICAT' && <Verify />} <Source url={r.sourceUrl} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DeRaportat() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const [report, setReport] = useState<ReportId | null>(null);
  const ob = useMemo(() => farmObligations(view, farm), [view, farm]);

  return (
    <OpenReport.Provider value={setReport}>
      <header className="page-h">
        <div>
          <h1>De raportat</h1>
          <p className="lead">Ce depui la APIA și la primărie, până când și ce să ai la tine. Merge și fără internet.</p>
        </div>
      </header>
      {farm.isIon && <p className="note">Pe ferma lui Ion, litrii de motorină sunt un exemplu.</p>}
      <div className="bento">
        <DieselCard ob={ob} today={view.today} />
        <Rules rules={ob.rules} />
        <section className="card s12" aria-labelledby="ob-next">
          <div className="card-h">
            <h2 id="ob-next">Ce urmează</h2>
          </div>
          <ItemList items={ob.upcoming} soonDays={ob.dueDays} empty="Nimic de depus în anul care vine." />
          <p className="note">Apasă pe un termen ca să vezi ce duci și unde. Datele cu „de verificat” sunt socotite din lege sau luate din presă, nu anunțate de APIA.</p>
        </section>
        {ob.records && (
          <section className="card s12" aria-labelledby="ob-records">
            <div className="card-h">
              <h2 id="ob-records">Ce ții scris tot anul</h2>
            </div>
            <p className="note">
              {ob.records.note} <Source url={ob.records.source_url} />
            </p>
            <ul className="ob-list">
              {ob.records.items.map((r) => (
                <li key={r.id} className="ob-body">
                  <p>
                    <b>{r.title_ro}</b>
                  </p>
                  <p>
                    {r.detail_ro}{' '}
                    {isReportId(r.report) && (
                      <button type="button" className="ob-link" onClick={() => setReport(r.report as ReportId)}>
                        Îl faci din Rapoarte
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {ob.livestock.length > 0 && (
          <section className="card s12" aria-labelledby="ob-animals">
            <div className="card-h">
              <h2 id="ob-animals">Dacă ai și animale</h2>
            </div>
            <ItemList items={ob.livestock} soonDays={ob.dueDays} empty="" />
          </section>
        )}
      </div>
      <ReportSheet report={report} onClose={() => setReport(null)} />
    </OpenReport.Provider>
  );
}
