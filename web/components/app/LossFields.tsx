'use client';
/* Hectares that didn't make it to harvest, and why (docs/crop-loss-plan.md). Used on the gathered
   sheet, the "Am pierdut o parte" sheet and when a harvest is closed. Hectares are typed and the %
   is shown, because farmers know which field died. */
import { LOSS_LABELS, lossEcho, type LossText } from '../../lib/ui/loss';

export function LossFields({ cropName, areaHa, value, onChange, label = 'Câte hectare n-ai putut strânge?' }: { cropName: string; areaHa: number; value: LossText; onChange: (v: LossText) => void; label?: string }) {
  const echo = lossEcho(value, areaHa);
  return (
    <div className="loss">
      <label>
        {label}
        <input inputMode="decimal" autoComplete="off" placeholder="nu știu" value={value.ha} onChange={(e) => onChange({ ...value, ha: e.target.value })} />
      </label>
      {echo && <p className="note">{echo}</p>}
      <div className="loss-why" role="group" aria-label={`De ce s-a pierdut ${cropName.toLowerCase()}`}>
        {LOSS_LABELS.map(([k, l]) => (
          <button key={k} type="button" className="chipb" aria-pressed={value.reason === k} onClick={() => onChange({ ...value, reason: value.reason === k ? null : k })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
