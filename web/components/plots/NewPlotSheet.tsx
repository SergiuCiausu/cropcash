'use client';
/* „Desenează o parcelă”: a new parcel drawn by hand on /harta (docs/harta-plan.md). First the outline, in the
   same editor as „Mută sau desenează pe hartă”, then its name and what grows on it. Saving makes a real
   parcel through save_plots, which takes its hectares out of the crop's „fără loc pe hartă” ones.
   Offline: the drawing works on a plain background, but saving needs internet (save_plots doesn't wait in
   the queue), so the save button is a NetButton. */
import { useId, useRef, useState, type FormEvent } from 'react';
import { drawnPlotInput, unplacedChange, type LpisBloc, type PlotInput, type Position } from '../../../packages/shared/src/plots/index';
import { failText, ha } from '../../lib/cc/format';
import { useOnline } from '../../lib/cc/react';
import { ErrorLine, NetButton, Sheet } from '../app/bits';
import { ShapeEditor, type ShapeEditorResult } from '../map/ShapeEditor';
import '../../styles/events.css';

export interface NewPlotCrop {
  id: string;
  name: string;
  /** Its hectares not on the map yet, in ari (0 when all are placed). */
  unplacedAri: number;
}

export interface NewPlotSheetProps {
  open: boolean;
  onClose: () => void;
  /** The farm's crops this year, to pick what grows on the new parcel. */
  crops: readonly NewPlotCrop[];
  /** The crop it opens on: the „fără loc pe hartă” card it was started from. */
  cropId: string | null;
  county: string;
  harvestYear: number;
  /** The year the farm's plan counts: only there do the unplaced hectares move. */
  planYear: boolean;
  /** Where the map was looking, so the drawing starts there. */
  start: { centre: Position; zoom: number } | null;
  /** The APIA bloc tapped on the map: the drawing starts from it, and the parcel keeps its number. */
  bloc?: LpisBloc | null;
  /** Saves the parcel; resolves with its id when the server gave one. */
  onSave: (input: PlotInput) => Promise<string | null>;
  onSaved: (id: string | null) => void;
}

export function NewPlotSheet(props: NewPlotSheetProps) {
  const [drawing, setDrawing] = useState<ShapeEditorResult | null>(null);
  const [editing, setEditing] = useState(true);
  const close = () => {
    setDrawing(null);
    setEditing(true);
    props.onClose();
  };
  const details = !!drawing && !editing;
  return (
    <Sheet open={props.open} onClose={close} className={details ? 'detail pc-sheet' : 'detail se-sheet'} label="Parcelă nouă" keepOnBackdrop>
      {props.open && !details && (
        <ShapeEditor
          title={props.bloc ? `parcela nouă din blocul ${props.bloc.bloc}` : 'parcela nouă'}
          bloc={props.bloc?.geometry ?? null}
          initial={drawing?.shape ?? null}
          declaredAri={null}
          start={props.start}
          onDone={(r) => {
            setDrawing(r);
            setEditing(false);
          }}
          onCancel={close}
        />
      )}
      {props.open && details && <Details {...props} drawing={drawing} onRedraw={() => setEditing(true)} onClose={close} />}
    </Sheet>
  );
}

function Details({ drawing, crops, cropId: firstCrop, county, harvestYear, planYear, bloc = null, onSave, onSaved, onRedraw, onClose }: NewPlotSheetProps & { drawing: ShapeEditorResult; onRedraw: () => void }) {
  const online = useOnline();
  const [name, setName] = useState('');
  // The crop it was started for, else the one with the most hectares still off the map.
  const [cropId, setCropId] = useState(() => firstCrop ?? [...crops].sort((a, b) => b.unplacedAri - a.unplacedAri)[0]?.id ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = useRef(false);
  const nameId = useId();

  const crop = crops.find((c) => c.id === cropId) ?? null;
  const change = unplacedChange(drawing.areaAri, crop?.unplacedAri ?? 0, crop?.id ?? null, planYear);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saved.current) return;
    const input = drawnPlotInput({ name, county, shape: drawing.shape, geometry: drawing.geometry, areaAri: drawing.areaAri, cropId: cropId || null, bloc });
    if (!input) return setErr('Desenul e prea mic ca să aibă o suprafață. Desenează parcela din nou.');
    setErr(null);
    setBusy(true);
    try {
      const id = await onSave(input);
      saved.current = true;
      onSaved(id);
      onClose();
    } catch (e2) {
      setErr(`Nu am putut salva parcela. ${failText(e2, online)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          Parcela nouă
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="np-area">
        Ai desenat <b>{ha(drawing.areaAri)} ha</b>
        {bloc ? ` în blocul fizic ${bloc.bloc}` : ''}.
      </p>
      <div className="ev-fields">
        <label htmlFor={nameId}>
          Cum îi spui (dacă vrei)
          <input id={nameId} autoComplete="off" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="de exemplu, La salcâmi" />
        </label>
        <label>
          Ce crește pe ea în {harvestYear}
          <select value={cropId} onChange={(e) => setCropId(e.target.value)}>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">Nimic semănat încă</option>
          </select>
        </label>
      </div>
      {change && crop && <p className="note np-change">{changeText(change, crop)}</p>}
      <ErrorLine>{err}</ErrorLine>
      <div className="acts">
        <NetButton type="submit" className="btn btn-dark" reason="Ca să salvăm parcela nouă ai nevoie de internet." disabled={busy}>
          Salvează parcela
        </NetButton>
        <button type="button" className="btn btn-line" onClick={onRedraw}>
          Schimbă desenul
        </button>
      </div>
    </form>
  );
}

function changeText(change: NonNullable<ReturnType<typeof unplacedChange>>, crop: NewPlotCrop): string {
  const name = crop.name.toLowerCase();
  if (change.kind === 'all') return `Toate hectarele de ${name} au acum loc pe hartă.`;
  if (change.kind === 'shrinks') return `Din cele ${ha(crop.unplacedAri)} ha de ${name} fără loc pe hartă mai rămân ${ha(change.leftAri)} ha.`;
  return crop.unplacedAri > 0
    ? `Ai desenat cu ${ha(change.moreAri)} ha mai mult decât aveai de ${name} fără loc pe hartă. Suprafața de ${name} din plan crește cu atât.`
    : `Suprafața de ${name} din plan crește cu ${ha(change.moreAri)} ha.`;
}
