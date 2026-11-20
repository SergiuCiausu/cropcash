'use client';
/* The "Pentru APIA" tab of /rapoarte (docs/rapoarte-apia-plan.md §2): every paper this farm
   files with APIA or the primărie, or keeps for a control, from docs/data/apia-papers.json. Each one
   says when it's due and what to bring; the ones the app can fill have the report's card, with what
   the farm's data still lacks. Works offline and on Ion's farm: the list is bundled data and the farm
   on the phone, the parcels come from the copy on the phone. */
import { useMemo, useState } from 'react';
import { currentPeriod, type ApiaAnswers, type ApiaFact, type Filing, type FilingSection } from '../../../packages/shared/src/reports/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import { date, failText, zile } from '../../lib/cc/format';
import { useFarm, useOnline, useStore, useView } from '../../lib/cc/react';
import { farmFilings } from '../../lib/reports/apia-filings';
import { REPORTS } from '../../lib/reports/build';
import { coupledCandidates } from '../../lib/reports/inputs';
import { ErrorLine, NetButton, Verify } from '../app/bits';
import { usePlots } from '../plots/usePlots';
import { AnimalsCard } from './AnimalsCard';
import { ReportCard } from './ReportCards';
import '../../styles/obligations.css';

const ROMAN = ['I', 'II', 'III', 'IV'];
const quarterName = (key: string) => `trimestrul ${ROMAN[+key.slice(-1) - 1]} din ${key.slice(0, 4)}`;

/** The condition behind a „maybe”, as a question the farmer answers in their head. */
const IF_TEXT: Record<ApiaFact, string> = {
  arable: 'ai teren arabil',
  grassland: 'ai pajiște permanentă',
  fallow: 'ai teren necultivat',
  fuel: 'folosești motorină în fermă (n-ai notat nicio factură de motorină în ultimul an)',
  animals: 'ai animale (aplicația nu le ține încă)',
  coupled_crops: 'ai cerut sprijin cuplat pentru o cultură',
  organic: 'ai teren în agricultură ecologică',
};

/** The facts only the farmer can tell (the land comes from the map), as the question on a „maybe” card. */
const QUESTION: Partial<Record<ApiaFact, string>> = {
  animals: 'Ai animale în fermă?',
  fuel: 'Folosești motorină în fermă?',
  organic: 'Ai teren în agricultură ecologică?',
  coupled_crops: 'Ai cerut sprijin cuplat pentru o cultură?',
};
const KEY: Partial<Record<ApiaFact, 'animals' | 'fuel' | 'organic'>> = { animals: 'animals', fuel: 'fuel', organic: 'organic' };

/** „Da” / „Nu” to one fact. Saved on the farm (needs internet), or on the phone for Ion's farm. */
function Answer({ fact, plots, year }: { fact: ApiaFact; plots: FarmPlots | null; year: number }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const store = useStore()!;
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const question = QUESTION[fact];
  const coupled = useMemo(() => (fact === 'coupled_crops' ? coupledCandidates(farm, view, plots, year) : []), [fact, farm, view, plots, year]);
  if (!question) return null;

  async function save(patch: ApiaAnswers) {
    setBusy(true);
    setErr('');
    try {
      await store.setApiaAnswers({ ...farm.apiaAnswers, ...patch });
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }
  const yes: ApiaAnswers = fact === 'coupled_crops' ? { coupledCrops: coupled.map((c) => c.cropId) } : { [KEY[fact]!]: true };
  const no: ApiaAnswers = fact === 'coupled_crops' ? { coupledCrops: [] } : { [KEY[fact]!]: false };
  const Button = (props: { onClick: () => void; children: string }) =>
    farm.me ? (
      <NetButton reason="Răspunsul se salvează pe fermă, cu internet." className="btn" disabled={busy} {...props} />
    ) : (
      <button type="button" className="btn" disabled={busy} {...props} />
    );
  return (
    <div className="apia-ask">
      <p>
        <b>{question}</b>
      </p>
      {fact === 'coupled_crops' && !coupled.length && <p className="note">Niciuna dintre culturile din anul ăsta nu primește sprijin cuplat.</p>}
      <div className="ob-actions">
        {(fact !== 'coupled_crops' || coupled.length > 0) && (
          <Button onClick={() => void save(yes)}>{fact === 'coupled_crops' ? `Da, pentru ${coupled.map((c) => c.name.toLowerCase()).join(', ')}` : 'Da'}</Button>
        )}
        <Button onClick={() => void save(no)}>Nu</Button>
      </div>
      <ErrorLine>{err}</ErrorLine>
    </div>
  );
}

const WHERE: Record<Filing['paper']['group'], string> = { apia: 'La APIA', control: 'La fermă', primarie: 'La primărie' };

function DeadlineLine({ f }: { f: Filing }) {
  const d = f.deadline;
  if (!d) return null;
  const left = d.daysLeft < 0 ? 'a trecut' : d.daysLeft === 0 ? 'azi' : `în ${zile(d.daysLeft)}`;
  return (
    <p className="apia-when">
      {d.period && <>Pentru {quarterName(d.period)}: </>}
      {d.start && !d.open && d.daysLeft >= 0 ? (
        <>
          se depune între {date(d.start, true)} și {date(d.end, true)}
        </>
      ) : (
        <>
          până pe {date(d.end, true)} · <b>{left}</b>
        </>
      )}
      {d.estimated && ', dată estimată după anul ăsta'} {d.status === 'DE-VERIFICAT' && <Verify />}
    </p>
  );
}

function PaperCard({ f, onSaved, plots = null, year = 0 }: { f: Filing; onSaved: () => void; plots?: FarmPlots | null; year?: number }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const def = REPORTS.find((r) => r.id === f.paper.report) ?? null;
  const id = `apia-${f.paper.id}`;
  return (
    <section className="card s6 apia-paper" aria-labelledby={id}>
      <div className="card-h">
        <h2 id={id}>{f.paper.title_ro}</h2>
        <span className="tag n">{WHERE[f.paper.group]}</span>
      </div>
      <DeadlineLine f={f} />
      {f.section === 'maybe' && <p className="ob-warn">Doar dacă {f.unknown.map((u) => IF_TEXT[u]).join(' și ')}.</p>}
      {f.section === 'maybe' && f.unknown.map((u) => <Answer key={u} fact={u} plots={plots} year={year} />)}
      <p className="note">{f.paper.about_ro}</p>
      {f.paper.documents_ro.length > 0 && (
        <>
          <h3 className="ob-sub">Ce duci</h3>
          <ul className="ob-docs">
            {f.paper.documents_ro.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {f.paper.how_ro && <p className="note">{f.paper.how_ro}</p>}
      {f.paper.note && <p className="note">{f.paper.note}</p>}
      {def && <ReportCard def={def} plots="own" farm={farm} view={view} onSaved={onSaved} bare gaps />}
      {f.paper.source_url && (
        <p className="note">
          <a href={f.paper.source_url} target="_blank" rel="noreferrer">
            Vezi sursa
          </a>
        </p>
      )}
    </section>
  );
}

function Rules({ filings, onSaved }: { filings: Filing[]; onSaved: () => void }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  if (!filings.length) return null;
  /* The paper the app fills for these (the notice to APIA). */
  const defs = [...new Set(filings.map((f) => f.paper.report))].flatMap((r) => REPORTS.filter((d) => d.id === r));
  return (
    <section className="card s12" aria-labelledby="apia-rules">
      <div className="card-h">
        <h2 id="apia-rules">Când se întâmplă ceva</h2>
      </div>
      <ul className="ob-list">
        {filings.flatMap((f) =>
          f.rules.map((r) => (
            <li key={r.eventId} className="ob-body">
              <p>
                <b>{r.title}</b>
              </p>
              {r.note && <p>{r.note}</p>}
            </li>
          )),
        )}
      </ul>
      {defs.map((def) => (
        <div key={def.id} className="apia-notice">
          <h3 className="ob-sub">{def.title}</h3>
          <p className="note">{def.about}</p>
          <ReportCard def={def} plots="own" farm={farm} view={view} onSaved={onSaved} bare gaps />
        </div>
      ))}
    </section>
  );
}

function Group({ title, id, filings, onSaved, lead, plots = null, year = 0 }: { title: string; id: string; filings: Filing[]; onSaved: () => void; lead?: string; plots?: FarmPlots | null; year?: number }) {
  if (!filings.length) return null;
  return (
    <>
      <div className="apia-group">
        <h2 id={id}>{title}</h2>
        {lead && <p className="note">{lead}</p>}
      </div>
      <div className="bento" aria-labelledby={id}>
        {filings.map((f) => (
          <PaperCard key={f.paper.id} f={f} onSaved={onSaved} plots={plots} year={year} />
        ))}
      </div>
    </>
  );
}

export function ApiaPapers({ onSaved }: { onSaved: () => void }) {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const year = +currentPeriod('harvest', view.today).key;
  const { plots } = usePlots(year);
  const filings = useMemo(() => farmFilings(farm, view, plots, year), [farm, view, plots, year]);
  const by = (s: FilingSection) => filings.filter((f) => f.section === s);
  const past = by('past');
  const no = by('not_applicable');
  /* The animals card: once the farm says it has animals, or has some noted. */
  const section = (id: string) => filings.find((f) => f.paper.id === id)?.section;
  const hasAnimals = !!farm.livestock || farm.apiaAnswers.animals === true;
  const grassland = section('pajisti-fan') !== undefined && section('pajisti-fan') !== 'not_applicable';
  const checklist = REPORTS.find((r) => r.id === 'apia-checklist')!;
  const answered = Object.keys(farm.apiaAnswers).length > 0;
  const store = useStore()!;
  const online = useOnline();
  const [resetErr, setResetErr] = useState('');
  async function askAgain() {
    setResetErr('');
    try {
      await store.setApiaAnswers({});
    } catch (e) {
      setResetErr(failText(e, online));
    }
  }

  return (
    <div className="apia-papers">
      <Group title="Urmează" id="apia-next" filings={by('next')} onSaved={onSaved} lead="Ce depui la APIA și la primărie, cu cel mai apropiat termen primul." />
      <div className="bento">
        <section className="card s12" aria-labelledby="apia-checklist">
          <div className="card-h">
            <h2 id="apia-checklist">{checklist.title}</h2>
          </div>
          <p className="note">{checklist.about}</p>
          <ReportCard def={checklist} plots="own" farm={farm} view={view} onSaved={onSaved} bare />
        </section>
      </div>
      <Group title="Ține la fermă" id="apia-keep" filings={by('keep')} onSaved={onSaved} lead="Nu le depui, dar APIA ți le cere la control." />
      <div className="bento">
        <Rules filings={by('when')} onSaved={onSaved} />
        {hasAnimals && <AnimalsCard key={year} year={year} grassland={grassland} />}
      </div>
      <Group title="Poate ți se aplică" id="apia-maybe" filings={by('maybe')} onSaved={onSaved} plots={plots} year={year} lead="Aplicația nu știe încă dacă ai nevoie de ele. Răspunde și lista se potrivește fermei tale." />
      {past.length > 0 && (
        <details className="apia-more">
          <summary>Trecute ({past.length})</summary>
          <div className="bento">
            {past.map((f) => (
              <PaperCard key={f.paper.id} f={f} onSaved={onSaved} />
            ))}
          </div>
        </details>
      )}
      {no.length > 0 && (
        <details className="apia-more">
          <summary>Nu ți se aplică ({no.length})</summary>
          <ul className="ob-docs">
            {no.map((f) => (
              <li key={f.paper.id}>
                <b>{f.paper.title_ro}</b>: {f.paper.about_ro}
              </li>
            ))}
          </ul>
          <p className="note">Le-am scos după parcelele de pe hartă, culturile din recoltă și răspunsurile tale. Dacă acolo lipsește ceva, adaugă și lista se schimbă.</p>
          {answered && (
            <div className="ob-actions">
              {farm.me ? (
                <NetButton reason="Răspunsurile se schimbă pe fermă, cu internet." className="btn" onClick={() => void askAgain()}>
                  Întreabă-mă din nou
                </NetButton>
              ) : (
                <button type="button" className="btn" onClick={() => void askAgain()}>
                  Întreabă-mă din nou
                </button>
              )}
            </div>
          )}
          <ErrorLine>{resetErr}</ErrorLine>
        </details>
      )}
    </div>
  );
}
