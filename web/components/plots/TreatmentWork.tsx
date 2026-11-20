'use client';
/* A treatment expense on a parcel can also note the work it paid for (docs/harta-plan.md, step 10).
   Used by the record form on Recolte and by „Adaugă cheltuială aici” on a parcel's card. Without internet
   both the money and the work wait in the queue (step 11); the work then isn't linked to the expense,
   since the expense has no id until it's sent. */
import { TREATMENT_KINDS, type OperationKind } from '../../../packages/shared/src/plots/index';
import { kindLabel } from './filter-text';

export interface TreatmentWorkValue {
  on: boolean;
  kind: OperationKind;
  product: string;
  /** What it was against and who applied it: the treatments register asks for both (migration 051). */
  target?: string;
  operator?: string;
}
export const NEW_TREATMENT: TreatmentWorkValue = { on: true, kind: 'fungicide', product: '' };

/** The add_operation input for it, or null when there's no work to note. */
export function treatmentInput(v: TreatmentWorkValue, plotId: string, harvestYear: number, day: string) {
  if (!v.on) return null;
  const text = (s: string | undefined, max: number) => s?.trim().slice(0, max) || null;
  return {
    plotId,
    harvestYear,
    kind: v.kind,
    status: 'done' as const,
    onDate: day,
    product: text(v.product, 120),
    target: text(v.target, 120),
    operator: text(v.operator, 80),
  };
}

export function TreatmentWork({ value, onChange }: { value: TreatmentWorkValue; onChange: (v: TreatmentWorkValue) => void }) {
  return (
    <fieldset className="tw">
      <label className="tw-check">
        <input type="checkbox" checked={value.on} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        Notează și lucrarea pe parcelă
      </label>
      {value.on && (
        <>
          <div className="chips" role="group" aria-label="Ce tratament">
            {TREATMENT_KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={k === value.kind} onClick={() => onChange({ ...value, kind: k })}>
                {kindLabel(k)}
              </button>
            ))}
          </div>
          <label>
            Ce produs ai dat (nu e obligatoriu)
            <input autoComplete="off" maxLength={120} value={value.product} onChange={(e) => onChange({ ...value, product: e.target.value })} />
          </label>
          <label>
            Împotriva a ce (boala, dăunătorul sau buruiana)
            <input autoComplete="off" maxLength={120} value={value.target ?? ''} onChange={(e) => onChange({ ...value, target: e.target.value })} />
          </label>
          <label>
            Cine l-a dat
            <input autoComplete="off" maxLength={80} value={value.operator ?? ''} onChange={(e) => onChange({ ...value, operator: e.target.value })} />
          </label>
          <p className="note">Le cere registrul tratamentelor, pe care APIA îl verifică la control.</p>
        </>
      )}
    </fieldset>
  );
}
