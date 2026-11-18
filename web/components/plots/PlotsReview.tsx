'use client';
/* "Parcelele din cerere": the II.A rows of a cerere de plată, checked by the farmer before they go on
   the map (docs/harta-plan.md, step 2). Each row says whether it's a new parcel, the same as one the farm
   already has, or one to check. Nothing is saved until „Le pun pe hartă”; saving needs the internet.
   The page that opens it passes `onSave`, which sends the parcels to save_plots. */
import { useMemo, useState, type FormEvent } from 'react';
import {
  isSavable,
  matchSeasonRows,
  paperPlotsToInputs,
  seasonRowOf,
  type PaperPlot,
  type MapPlacement,
  type PaperPlotIssue,
  type PlotInput,
  type RowMatch,
  type StoredPlot,
} from '../../../packages/shared/src/plots/index';
import { ha } from '../../lib/cc/format';
import type { RowLocation } from '../../lib/cc/lpis';
import { ErrorLine, NetButton, Sheet } from '../app/bits';
import '../../styles/plots.css';

export const SAVE_NEEDS_NET = 'Ca să salvăm parcelele ai nevoie de internet.';

const ISSUES: Record<Exclude<PaperPlotIssue, 'unknown_crop'>, string> = {
  no_area: 'Nu am citit suprafața, așa că rândul nu se salvează.',
  no_siruta: 'Nu am citit codul SIRUTA. Parcela se salvează, dar o pui pe hartă de mână.',
  no_bloc: 'Nu am citit blocul fizic. Parcela se salvează, dar o pui pe hartă de mână.',
  no_parcel_no: 'Nu am citit numărul parcelei.',
  duplicate: 'Rândul apare de două ori pe hârtie. Îl luăm o singură dată.',
};

/** "Bloc 286 · parcela 1a", or the row number when neither was read. */
export function plotTitle(p: { blocFizic?: string | null; parcelNo?: string | null; bloc_fizic?: string | null; parcel_no?: string | null; name?: string | null }, row?: number): string {
  if (p.name) return p.name;
  const bloc = p.blocFizic ?? p.bloc_fizic;
  const no = p.parcelNo ?? p.parcel_no;
  if (bloc) return no ? `Bloc ${bloc} · parcela ${no}` : `Bloc ${bloc}`;
  if (no) return `Parcela ${no}`;
  return row === undefined ? 'Parcelă' : `Rândul ${row + 1}`;
}

const NONE: Readonly<Record<number, RowLocation>> = {};

/** What the farmer reads about a row's place on the map. Nothing before the lookup starts. */
export function whereText(l: RowLocation | undefined, p: PaperPlot): string | null {
  if (!l) return null;
  if (l.status === 'looking') return 'Caut blocul pe harta APIA…';
  if (l.status === 'failed')
    return l.offline
      ? 'Fără internet nu putem căuta blocul. Parcela se salvează și o pui pe hartă mai târziu.'
      : 'Harta APIA nu răspunde acum. Parcela se salvează și o pui pe hartă mai târziu.';
  const { fit, bloc } = l.placement;
  const name = bloc ? ` ${bloc.bloc}` : '';
  if (fit === 'whole') return `Pe hartă: blocul fizic${name}, cât parcela ta.`;
  if (fit === 'in_bloc')
    return `Pe hartă: undeva în blocul fizic${name}${bloc?.netAreaAri ? `, care are ${ha(bloc.netAreaAri)} ha` : ''}. O poți desena exact după ce salvezi.`;
  if (fit === 'in_commune') return `Blocul nu e pe harta APIA. O punem aproximativ${p.locality ? `, în ${p.locality}` : ''}, și o muți după ce salvezi.`;
  return null;
}

const TAGS: Record<RowMatch['kind'] | 'skip', [string, string]> = {
  same: ['ok', 'Aceeași ca înainte'],
  ask: ['v', 'Verifică'],
  new: ['n', 'Parcelă nouă'],
  skip: ['d', 'Nu se salvează'],
};

export interface PlotsReviewProps {
  open: boolean;
  onClose: () => void;
  /** The campaign year printed on the cerere (= the harvest year of its seasons). */
  year: number;
  plots: PaperPlot[];
  /** The total printed on the cerere, to check the rows against. */
  totalAri: number | null;
  existing: readonly StoredPlot[];
  /** plots-params.json match_overlap_min. */
  minOverlap: number;
  /** Where each row was found on the map, by row (useLocatedRows). A bloc outline also helps recognise a parcel that changed number. */
  located?: Readonly<Record<number, RowLocation>>;
  /** Used for a row whose județ couldn't be read. */
  county: string;
  cropName: (cropId: string) => string;
  /** Throws to show an error and keep the sheet open. */
  onSave: (year: number, inputs: PlotInput[]) => Promise<void>;
}

export function PlotsReview({ open, onClose, year, plots, totalAri, existing, minOverlap, located = NONE, county, cropName, onSave }: PlotsReviewProps) {
  const placements = useMemo(
    () => Object.fromEntries(Object.entries(located).flatMap(([row, l]) => (l.status === 'found' ? [[row, l.placement]] : []))) as Record<number, MapPlacement>,
    [located],
  );
  const matches = useMemo(
    () => matchSeasonRows(plots.map((p) => ({ ...seasonRowOf(p), geometry: placements[p.row]?.geometry ?? null })), existing, minOverlap),
    [plots, existing, minOverlap, placements],
  );
  const placed = useMemo(() => new Set(existing.filter((x) => x.geometry || x.centroid_lat !== null).map((x) => x.id)), [existing]);
  const [skip, setSkip] = useState<Set<number>>(() => new Set());
  const [same, setSame] = useState<Set<number>>(() => new Set());
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputs = paperPlotsToInputs(plots, matches, { county, sameAsAsked: same, skip, placements, placed });
  const readAri = plots.filter(isSavable).reduce((s, p) => s + (p.areaAri ?? 0), 0);
  const existingTitle = (id: string) => {
    const p = existing.find((x) => x.id === id);
    return p ? plotTitle(p) : 'o parcelă de pe hartă';
  };
  const toggle = (set: Set<number>, row: number, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(row);
    else next.delete(row);
    return next;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || inputs.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(year, inputs);
      onClose();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Nu am putut salva parcelele. Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} className="h-sheet plots-review" label="Parcelele din cerere" keepOnBackdrop locked={saving}>
      <form noValidate onSubmit={submit}>
        <ErrorLine>{err}</ErrorLine>
        <h2>Parcelele din cererea {year}</h2>
        <p className="hint">
          Am găsit {plots.length === 1 ? 'o parcelă' : `${plots.length} parcele`}, {ha(readAri)} ha. Verifică-le înainte să le punem pe hartă.
        </p>
        {totalAri !== null && totalAri !== readAri && (
          <p className="pr-warn" role="status">
            Pe cerere scrie {ha(totalAri)} ha în total, iar rândurile citite fac {ha(readAri)} ha. Uită-te dacă lipsește vreun rând.
          </p>
        )}
        <ul className="pr-list">
          {plots.map((p, i) => {
            const m = matches[i]!;
            const savable = isSavable(p);
            const skipped = !savable || skip.has(p.row);
            const [tagClass, tagText] = TAGS[skipped ? 'skip' : m.kind];
            const issues = p.issues.filter((x): x is keyof typeof ISSUES => x !== 'unknown_crop').map((x) => ISSUES[x]);
            const crop = p.cropId ? cropName(p.cropId) : `${p.cropName || 'Cultură necunoscută'}, nu e în aplicație`;
            return (
              <li key={p.row} className={skipped ? 'pr-row off' : 'pr-row'}>
                <label className="pr-pick">
                  <input
                    type="checkbox"
                    checked={!skipped}
                    disabled={!savable || saving}
                    onChange={(e) => setSkip((s) => toggle(s, p.row, !e.target.checked))}
                    aria-label={`Salvează ${plotTitle(p, p.row)}`}
                  />
                  <span className="pr-main">
                    <b>{plotTitle(p, p.row)}</b>
                    <span>
                      {crop}
                      {p.areaAri ? ` · ${ha(p.areaAri)} ha` : ''}
                    </span>
                    {p.locality && <span className="pr-where">{p.locality}</span>}
                  </span>
                  <span className={`tag ${tagClass}`}>{tagText}</span>
                </label>
                {m.kind === 'ask' && !skipped && (
                  <fieldset className="pr-ask">
                    <legend>Seamănă cu {existingTitle(m.plotId)}. E aceeași bucată de pământ?</legend>
                    <label>
                      <input type="radio" name={`same-${p.row}`} checked={same.has(p.row)} onChange={() => setSame((s) => toggle(s, p.row, true))} /> Da, e aceeași
                    </label>
                    <label>
                      <input type="radio" name={`same-${p.row}`} checked={!same.has(p.row)} onChange={() => setSame((s) => toggle(s, p.row, false))} /> Nu, e alta
                    </label>
                  </fieldset>
                )}
                {!skipped && whereText(located[p.row], p) && (
                  <p className={located[p.row]?.status === 'found' ? 'pr-where-map' : 'pr-issue'} aria-live="polite">
                    {whereText(located[p.row], p)}
                  </p>
                )}
                {issues.map((text) => (
                  <p key={text} className="pr-issue">
                    {text}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
        <div className="ob-actions">
          <NetButton type="submit" className="btn btn-dark" reason={SAVE_NEEDS_NET} disabled={saving || inputs.length === 0}>
            {saving ? 'Salvăm…' : inputs.length === 1 ? 'O pun pe hartă' : `Le pun pe hartă (${inputs.length})`}
          </NetButton>
          <button type="button" className="btn btn-line" onClick={onClose} disabled={saving}>
            Renunță
          </button>
        </div>
      </form>
    </Sheet>
  );
}
