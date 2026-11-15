'use client';
/* How a crop was sown: depth, row spacing and plant spacing, each a number with its unit. All three
   can stay empty. Lives inside a crop's fieldset in "Ce ai acum în pământ". */
import { LENGTH_UNITS, SOWING_FIELDS, SowingSchema, measureText, readMeasure, sowingOrNothing, type LengthUnit, type Sowing, type SowingField } from '../../../packages/shared/src/farm/index';

export type SowingDraft = Record<SowingField, { text: string; unit: LengthUnit }>;

const LABELS: Record<SowingField, string> = {
  depth: 'Cât de adânc ai semănat?',
  rowSpacing: 'Distanța între rânduri',
  plantSpacing: 'Distanța între plante pe rând',
};
const NAMES: Record<SowingField, string> = { depth: 'adâncimea', rowSpacing: 'distanța între rânduri', plantSpacing: 'distanța între plante' };

export function sowingDraft(s: Sowing | undefined): SowingDraft {
  return Object.fromEntries(
    SOWING_FIELDS.map((k) => [k, { text: s?.[k] ? String(s[k]!.value).replace('.', ',') : '', unit: s?.[k]?.unit ?? 'cm' }]),
  ) as SowingDraft;
}

/** The measurements to save, or the line to show the farmer when one can't be read. */
export function readSowingDraft(d: SowingDraft, crop: string): { sowing: Sowing | undefined } | { error: string } {
  const out: Partial<Sowing> = {};
  for (const k of SOWING_FIELDS) {
    if (!d[k].text.trim()) continue;
    const m = readMeasure(d[k].text, d[k].unit);
    if (!m) return { error: `${crop}: scrie ${NAMES[k]} ca număr, de exemplu 4 sau 12,5.` };
    out[k] = m;
  }
  const sowing = sowingOrNothing(out);
  if (sowing && !SowingSchema.safeParse(sowing).success) {
    const k = SOWING_FIELDS.find((f) => out[f] && !SowingSchema.safeParse({ [f]: out[f] }).success)!;
    return { error: `${crop}: ${NAMES[k]} pare prea mare. Verifică unitatea (mm, cm sau m).` };
  }
  return { sowing };
}

export function SowingFields({ draft, onChange, crop }: { draft: SowingDraft; onChange: (d: SowingDraft) => void; crop: string }) {
  const set = (k: SowingField, part: Partial<SowingDraft[SowingField]>) => onChange({ ...draft, [k]: { ...draft[k], ...part } });
  return (
    <div className="sow-fields">
      <p className="hint">Cum ai semănat (dacă știi, poți lăsa gol):</p>
      {SOWING_FIELDS.map((k) => (
        <div className="sow-row" key={k}>
          <label htmlFor={`sow-${crop}-${k}`}>{LABELS[k]}</label>
          <input
            id={`sow-${crop}-${k}`}
            inputMode="decimal"
            autoComplete="off"
            value={draft[k].text}
            onChange={(e) => set(k, { text: e.target.value })}
          />
          <select aria-label={`Unitatea pentru ${NAMES[k]}`} value={draft[k].unit} onChange={(e) => set(k, { unit: e.target.value as LengthUnit })}>
            {LENGTH_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

/** "Adâncime 4 cm, 12,5 cm între rânduri, 3 cm între plante.": only what was filled in, or ''. */
export function sowingSummary(s: Sowing | undefined): string {
  if (!s) return '';
  const parts = [
    s.depth && `adâncime ${measureText(s.depth)}`,
    s.rowSpacing && `${measureText(s.rowSpacing)} între rânduri`,
    s.plantSpacing && `${measureText(s.plantSpacing)} între plante`,
  ].filter(Boolean) as string[];
  if (!parts.length) return '';
  const text = parts.join(', ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}
