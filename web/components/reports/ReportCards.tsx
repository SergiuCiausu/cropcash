'use client';
/* One card per report: the period, and "Descarcă PDF". Used by the farmer's /rapoarte, on the farm in
   the phone's store, and by /contabil, on a farm the accountant was let in to (docs/rapoarte-pdf-plan.md).
   The PDF code loads only when a report is asked for. */
import { useState } from 'react';
import type { Period, PeriodKind } from '../../../packages/shared/src/reports/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import type { FarmState } from '../../lib/cc/farm';
import type { FarmView } from '../../lib/cc/plan';
import { PERIOD_KIND_NAMES, periodLabel, type ReportDef } from '../../lib/reports/build';
import { makeReport, NEEDS_PLOTS, periodChoices } from '../../lib/reports/inputs';
import { saveFile } from '../../lib/ui/share';
import { usePlots } from '../plots/usePlots';
import { ErrorLine } from '../app/bits';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The font files, as full URLs: the PDF library reads a bare path as a file on disk. */
const fontUrls = () => ({
  regular: new URL('/fonts/Geist-Regular.ttf', location.origin).href,
  semibold: new URL('/fonts/Geist-SemiBold.ttf', location.origin).href,
});

interface Common {
  farm: FarmState;
  view: FarmView;
  /** After a download that went to the Downloads folder (not the share sheet). */
  onSaved: () => void;
}

/** The period picked on a card. */
function usePeriod(def: ReportDef, farm: FarmState) {
  const [kind, setKind] = useState<PeriodKind>(def.periods[0]);
  const choices = periodChoices(kind, farm);
  const [key, setKey] = useState<string | null>(null);
  const period: Period = choices.find((p) => p.key === key) ?? choices[0]!;
  return { kind, setKind, choices, period, setKey };
}

type Picked = ReturnType<typeof usePeriod>;

/** The farmer's own parcels: they load for the harvest year picked, from the copy on the phone without internet. */
function OwnPlotsCard({ def, ...c }: Common & { def: ReportDef }) {
  const picked = usePeriod(def, c.farm);
  const p = usePlots(+picked.period.key.slice(0, 4));
  const missing = p.failed ? 'Parcelele nu s-au putut încărca. Deschide o dată Harta cu internet, apoi încearcă din nou.' : null;
  return <Card def={def} picked={picked} plots={p.plots} waiting={p.loading} missing={missing} {...c} />;
}

function GivenPlotsCard({ def, plots, ...c }: Common & { def: ReportDef; plots: FarmPlots | null }) {
  return <Card def={def} picked={usePeriod(def, c.farm)} plots={plots} {...c} />;
}

function Card({ def, picked, plots = null, waiting = false, missing = null, farm, view, onSaved }: Common & { def: ReportDef; picked: Picked; plots?: FarmPlots | null; waiting?: boolean; missing?: string | null }) {
  const { kind, setKind, choices, period, setKey } = picked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const make = async () => {
    if (missing) return setError(missing);
    setBusy(true);
    setError('');
    try {
      const model = makeReport(def.id, period, farm, view, Date.now(), plots);
      const { reportPdf } = await import('../../lib/reports/pdf');
      const blob = await reportPdf(model, fontUrls());
      const done = await saveFile(new File([blob], `${model.fileName}.pdf`, { type: 'application/pdf' }), model.title);
      if (done === 'downloaded') onSaved();
    } catch {
      setError('Nu s-a putut face PDF-ul. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  const id = `r-${def.id}`;
  return (
    <section className="card s6" aria-labelledby={id}>
      <div className="card-h">
        <h2 id={id}>{def.title}</h2>
      </div>
      <p className="note">{def.about}</p>
      {def.periods.length > 1 && (
        <label className="ob-field">
          Socotit pe
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PeriodKind);
              setKey(null);
            }}
          >
            {def.periods.map((k) => (
              <option key={k} value={k}>
                {PERIOD_KIND_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="ob-field">
        Perioada
        <select value={period.key} onChange={(e) => setKey(e.target.value)}>
          {choices.map((p) => (
            <option key={p.key} value={p.key}>
              {capital(periodLabel(p))}
            </option>
          ))}
        </select>
      </label>
      <ErrorLine>{error}</ErrorLine>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" disabled={busy || waiting} aria-busy={busy || waiting} onClick={() => void make()}>
          {busy ? 'Se pregătește…' : waiting ? 'Se încarcă parcelele…' : 'Descarcă PDF'}
        </button>
      </div>
    </section>
  );
}

/**
 * The cards for `reports`. `plots: 'own'` reads the signed-in farmer's parcels (/harta); a farm read for
 * a member brings its parcels with it.
 */
export function ReportCards({ reports, plots, ...c }: Common & { reports: ReportDef[]; plots: 'own' | FarmPlots | null }) {
  return (
    <div className="bento">
      {reports.map((def) =>
        !NEEDS_PLOTS.has(def.id) ? (
          <GivenPlotsCard key={def.id} def={def} plots={null} {...c} />
        ) : plots === 'own' ? (
          <OwnPlotsCard key={def.id} def={def} {...c} />
        ) : (
          <GivenPlotsCard key={def.id} def={def} plots={plots} {...c} />
        ),
      )}
    </div>
  );
}
