'use client';
/* One card per report: the period, and "Descarcă PDF". Used by the farmer's /rapoarte, on the farm in
   the phone's store, and by /contabil, on a farm the accountant was let in to (docs/rapoarte-pdf-plan.md).
   The PDF code loads only when a report is asked for. */
import { useMemo, useState } from 'react';
import type { Period, PeriodKind } from '../../../packages/shared/src/reports/index';
import type { FarmPlots } from '../../../packages/shared/src/plots/wire';
import type { FarmState } from '../../lib/cc/farm';
import type { FarmView } from '../../lib/cc/plan';
import { PERIOD_KIND_NAMES, periodLabel, type ReportDef } from '../../lib/reports/build';
import { makeReport, NEEDS_PLOTS, periodChoices } from '../../lib/reports/inputs';
import { saveFile } from '../../lib/ui/share';
import { usePlots } from '../plots/usePlots';
import type { Missing } from '../../lib/reports/model';
import { ErrorLine, useHref } from '../app/bits';
import { PageLink } from '../app/Frame';

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
function OwnPlotsCard({ def, ...c }: Common & CardOpts & { def: ReportDef }) {
  const picked = usePeriod(def, c.farm);
  const p = usePlots(+picked.period.key.slice(0, 4));
  const missing = p.failed ? 'Parcelele nu s-au putut încărca. Deschide o dată Harta cu internet, apoi încearcă din nou.' : null;
  return <Card def={def} picked={picked} plots={p.plots} waiting={p.loading} missing={missing} {...c} />;
}

function GivenPlotsCard({ def, plots, ...c }: Common & CardOpts & { def: ReportDef; plots: FarmPlots | null }) {
  return <Card def={def} picked={usePeriod(def, c.farm)} plots={plots} {...c} />;
}

/**
 * `bare`: only the period and the button, for a sheet that shows the title itself (ReportSheet).
 * `gaps`: also list what the farm's data lacks for the period picked (the APIA papers).
 */
interface CardOpts {
  bare?: boolean;
  gaps?: boolean;
}

const SCREENS: Record<NonNullable<Missing['screen']>, [string, string]> = { harta: ['/harta', 'Harta'], recolte: ['/recolte', 'Recolte'] };

/** What the report would ask to fill in by hand, each with the page where it's added instead. */
function Gaps({ items }: { items: Missing[] }) {
  const href = useHref();
  if (!items.length) return <p className="note report-ready">Datele fermei sunt complete pentru hârtia asta.</p>;
  return (
    <div className="report-gaps">
      <h3 className="ob-sub">Ce lipsește</h3>
      <ul>
        {items.map((m) => (
          <li key={m.text}>
            {m.text}
            {m.screen && (
              <>
                {' '}
                <PageLink path={SCREENS[m.screen][0]} href={href(SCREENS[m.screen][0])}>
                  Completează în {SCREENS[m.screen][1]}
                </PageLink>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ def, picked, plots = null, waiting = false, missing = null, farm, view, onSaved, bare = false, gaps = false }: Common & CardOpts & { def: ReportDef; picked: Picked; plots?: FarmPlots | null; waiting?: boolean; missing?: string | null }) {
  const { kind, setKind, choices, period, setKey } = picked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* The words a report asks for (def.asks): kept on the card only, never saved. */
  const [text, setText] = useState('');
  /* The same model the PDF is made from, so the card and the PDF list the same gaps. */
  const lacking = useMemo(() => {
    if (!gaps || waiting) return null;
    try {
      return makeReport(def.id, period, farm, view, Date.now(), plots, { text }).missing ?? [];
    } catch {
      return null;
    }
  }, [gaps, waiting, def.id, period, farm, view, plots, text]);

  const make = async () => {
    if (missing) return setError(missing);
    setBusy(true);
    setError('');
    try {
      const model = makeReport(def.id, period, farm, view, Date.now(), plots, { text });
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
  const body = (
    <>
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
      {def.asks && (
        <label className="ob-field">
          {def.asks}
          <textarea rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {lacking && <Gaps items={lacking} />}
      <ErrorLine>{error}</ErrorLine>
      <div className="ob-actions">
        <button type="button" className="btn btn-dark" disabled={busy || waiting} aria-busy={busy || waiting} onClick={() => void make()}>
          {busy ? 'Se pregătește…' : waiting ? 'Se încarcă parcelele…' : 'Descarcă PDF'}
        </button>
      </div>
    </>
  );
  if (bare) return body;
  return (
    <section className="card s6" aria-labelledby={id}>
      <div className="card-h">
        <h2 id={id}>{def.title}</h2>
      </div>
      <p className="note">{def.about}</p>
      {body}
    </section>
  );
}

/**
 * One report's card. `plots: 'own'` reads the signed-in farmer's parcels (/harta); a farm read for
 * a member brings its parcels with it.
 */
export function ReportCard({ def, plots, ...c }: Common & CardOpts & { def: ReportDef; plots: 'own' | FarmPlots | null }) {
  if (!NEEDS_PLOTS.has(def.id)) return <GivenPlotsCard def={def} plots={null} {...c} />;
  if (plots === 'own') return <OwnPlotsCard def={def} {...c} />;
  return <GivenPlotsCard def={def} plots={plots} {...c} />;
}

/** The cards for `reports`, on /rapoarte and /contabil. */
export function ReportCards({ reports, plots, ...c }: Common & { reports: ReportDef[]; plots: 'own' | FarmPlots | null }) {
  return (
    <div className="bento">
      {reports.map((def) => (
        <ReportCard key={def.id} def={def} plots={plots} {...c} />
      ))}
    </div>
  );
}
