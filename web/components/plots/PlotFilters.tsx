'use client';
/* The filter bar over the parcel list (docs/harta-plan.md, step 6): how many parcels show, a chip per
   active filter, the order, „Pe parcele” / „Pe culturi”, the campaign, and the „Filtre” sheet. Everything
   is worked out on the phone from rows already loaded, so it works the same without internet. The page
   keeps the filters in the address (usePlotQuery) and dims, on the map, the parcels they leave out. */
import { useMemo, useState, type ReactNode } from 'react';
import {
  filterOptions,
  filterPlots,
  withoutFilter,
  type OperationKind,
  type Placement,
  type PlotFilters as Filters,
  type PlotRow,
  type PlotView,
  type SortKey,
} from '../../../packages/shared/src/plots/index';
import { Sheet } from '../app/bits';
import { formOf, MONEY_KEYS, readForm, toggled, EMPTY_FORM, type FilterForm, type MoneyKey, type TextField } from './filter-form';
import { cropLabel, countText, showText, filterChips, kindLabel, landUseLabel, monthLabel, PLACEMENT_LABELS, SORT_LABELS, type FilterNames } from './filter-text';
import '../../styles/plots.css';

export interface PlotFiltersProps {
  /** Every parcel of the campaign shown, before filtering. */
  rows: readonly PlotRow[];
  filters: Filters;
  view: PlotView;
  onFilters: (f: Filters) => void;
  onView: (v: PlotView) => void;
  names: FilterNames;
  today: string;
  /** Campaigns there is data for; the picker shows when there are two or more. */
  years: readonly number[];
  /** The campaign shown when the address names none. */
  year: number;
}

/** Each order with the direction a farmer means by it: biggest first, soonest first. */
const SORTS: [SortKey, 'asc' | 'desc'][] = [
  ['name', 'asc'],
  ['size', 'desc'],
  ['result_ha', 'desc'],
  ['expenses', 'desc'],
  ['harvest', 'asc'],
  ['next_treatment', 'asc'],
];

const MONEY_WORDS: Record<MoneyKey, string> = { revenue: 'Venit', expenses: 'Cheltuieli', result: 'Rezultat (venit minus cheltuieli)' };
const BAD_NUMBER = 'Nu înțelegem ce ai scris. Scrie doar cifre, de exemplu 2,5 ha sau 1.500 lei.';

export function PlotFilters({ rows, filters, view, onFilters, onView, names, today, years, year }: PlotFiltersProps) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => filterPlots(rows, filters, today, names.soonDays).length, [rows, filters, today, names.soonDays]);
  const chips = filterChips(filters, names);
  const sortValue = `${view.sort}-${view.dir}`;
  const natural = SORTS.some(([k, d]) => `${k}-${d}` === sortValue);

  return (
    <div className="pf" role="region" aria-label="Filtre parcele">
      <div className="pf-top">
        <p className="pf-count" aria-live="polite">
          {countText(shown, rows.length)}
        </p>
        {chips.length > 0 && (
          <button type="button" className="pf-clear" onClick={() => onFilters({})}>
            Șterge filtrele
          </button>
        )}
      </div>

      <div className="pf-controls">
        <button type="button" className="btn btn-line pf-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Filtre{chips.length ? ` (${chips.length})` : ''}
        </button>
        <div className="pf-seg" role="group" aria-label="Cum arăt lista">
          <button type="button" aria-pressed={!view.byCrop} onClick={() => onView({ ...view, byCrop: false })}>
            Pe parcele
          </button>
          <button type="button" aria-pressed={view.byCrop} onClick={() => onView({ ...view, byCrop: true })}>
            Pe culturi
          </button>
        </div>
        <label className="pf-select">
          <span>Ordine</span>
          <select
            value={sortValue}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split('-') as [SortKey, 'asc' | 'desc'];
              onView({ ...view, sort, dir });
            }}
          >
            {SORTS.map(([k, d]) => (
              <option key={k} value={`${k}-${d}`}>
                {SORT_LABELS[k]}
              </option>
            ))}
            {!natural && <option value={sortValue}>{SORT_LABELS[view.sort]} (invers)</option>}
          </select>
        </label>
        {years.length > 1 && (
          <label className="pf-select">
            <span>Recolta</span>
            <select value={view.year ?? year} onChange={(e) => onView({ ...view, year: Number(e.target.value) === year ? undefined : Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {chips.length > 0 && (
        <ul className="pf-chips" aria-label="Filtre active">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" className="pf-chip" aria-label={`Scoate filtrul: ${c.text}`} onClick={() => onFilters(withoutFilter(filters, c.key))}>
                {c.text}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <FilterSheet
        open={open}
        onClose={() => setOpen(false)}
        rows={rows}
        filters={filters}
        names={names}
        today={today}
        onApply={(f) => {
          onFilters(f);
          setOpen(false);
        }}
      />
    </div>
  );
}

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  rows: readonly PlotRow[];
  filters: Filters;
  names: FilterNames;
  today: string;
  onApply: (f: Filters) => void;
}

/** Mounted fresh on each opening, so it starts from the filters in use. */
function FilterSheet(props: FilterSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} className="h-sheet pf-sheet" label="Filtre" keepOnBackdrop>
      <FilterSheetBody {...props} />
    </Sheet>
  );
}

function FilterSheetBody({ onClose, rows, filters, names, today, onApply }: FilterSheetProps) {
  const [form, setForm] = useState<FilterForm>(() => formOf(filters));
  const o = useMemo(() => filterOptions(rows), [rows]);
  const reading = readForm(form);
  const matching = reading.ok ? filterPlots(rows, reading.filters, today, names.soonDays).length : null;
  const bad = new Set<TextField>(reading.ok ? [] : reading.bad);
  const set = (patch: Partial<FilterForm>) => setForm((f) => ({ ...f, ...patch }));
  const setMoney = (k: MoneyKey, patch: Partial<FilterForm['money'][MoneyKey]>) => setForm((f) => ({ ...f, money: { ...f.money, [k]: { ...f.money[k], ...patch } } }));

  return (
    <form
      className="pf-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (reading.ok) onApply(reading.filters);
      }}
    >
      <h2>Filtre</h2>

      {o.crops.length > 1 && (
        <Group legend="Cultura">
          <Checks values={o.crops} chosen={form.crops} label={(c) => cropLabel(c, names)} onChange={(crops) => set({ crops })} />
        </Group>
      )}

      {o.sizeAri && o.sizeAri.min !== o.sizeAri.max && (
        <Group legend="Suprafața, în hectare">
          <Between
            unit="ha"
            min={form.sizeMin}
            max={form.sizeMax}
            badMin={bad.has('sizeMin')}
            badMax={bad.has('sizeMax')}
            onMin={(sizeMin) => set({ sizeMin })}
            onMax={(sizeMax) => set({ sizeMax })}
          />
        </Group>
      )}

      {o.hasMoney &&
        MONEY_KEYS.map((k) => (
          <Group key={k} legend={MONEY_WORDS[k]}>
            <Between
              unit="lei"
              min={form.money[k].min}
              max={form.money[k].max}
              badMin={bad.has(`${k}Min`)}
              badMax={bad.has(`${k}Max`)}
              onMin={(min) => setMoney(k, { min })}
              onMax={(max) => setMoney(k, { max })}
            />
            <div className="pf-seg" role="group" aria-label={`${MONEY_WORDS[k]}: în total sau pe hectar`}>
              <button type="button" aria-pressed={!form.money[k].perHa} onClick={() => setMoney(k, { perHa: false })}>
                În total
              </button>
              <button type="button" aria-pressed={form.money[k].perHa} onClick={() => setMoney(k, { perHa: true })}>
                Pe hectar
              </button>
            </div>
          </Group>
        ))}

      <Group legend="Tratamente făcute">
        <Radios
          name="pf-treat"
          value={form.treatments}
          options={[['', 'Nu contează'], ['some', 'Cel puțin unul'], ['none', 'Niciunul încă'], ...(o.doneKinds.length ? ([['kinds', 'Anume lucrări']] as const) : [])]}
          onChange={(treatments) => set({ treatments })}
        />
        {form.treatments === 'kinds' && <Checks values={o.doneKinds} chosen={form.kinds} label={kindLabel} onChange={(kinds) => set({ kinds: kinds as OperationKind[] })} />}
      </Group>

      {o.hasTodo && (
        <Group legend="Lucrări de făcut">
          <Radios
            name="pf-todo"
            value={form.todo}
            options={[
              ['', 'Nu contează'],
              ['any', 'Oricare'],
              ['overdue', 'Întârziate'],
              ['soon', `În următoarele ${names.soonDays} de zile`],
            ]}
            onChange={(todo) => set({ todo })}
          />
        </Group>
      )}

      {o.sown.length > 0 && (
        <Group legend="Semănat">
          <MonthPair months={o.sown} from={form.sownFrom} to={form.sownTo} onFrom={(sownFrom) => set({ sownFrom })} onTo={(sownTo) => set({ sownTo })} />
        </Group>
      )}
      {o.harvest.length > 0 && (
        <Group legend="Recolta așteptată">
          <MonthPair months={o.harvest} from={form.harvestFrom} to={form.harvestTo} onFrom={(harvestFrom) => set({ harvestFrom })} onTo={(harvestTo) => set({ harvestTo })} />
        </Group>
      )}

      {o.siruta.length > 1 && (
        <Group legend="Localitatea">
          <Checks
            values={[...o.siruta].sort((a, b) => names.placeName(a).localeCompare(names.placeName(b), 'ro'))}
            chosen={form.siruta}
            label={names.placeName}
            onChange={(siruta) => set({ siruta })}
          />
        </Group>
      )}

      <label className="pf-field">
        Bloc fizic, parcelă sau nume
        <input type="text" value={form.text} maxLength={40} placeholder="de exemplu 286 sau La pădure" onChange={(e) => set({ text: e.target.value })} />
      </label>

      {o.placements.length > 1 && (
        <Group legend="Locul pe hartă">
          <Checks values={o.placements} chosen={form.placement} label={(p: Placement) => PLACEMENT_LABELS[p]} onChange={(placement) => set({ placement })} />
        </Group>
      )}

      {o.landUses.length > 1 && (
        <Group legend="Folosința terenului">
          <Checks values={o.landUses} chosen={form.landUse} label={landUseLabel} onChange={(landUse) => set({ landUse })} />
        </Group>
      )}

      {o.hasRotation && (
        <Group legend="Față de anul trecut">
          <Radios
            name="pf-rot"
            value={form.rotation}
            options={[
              ['', 'Nu contează'],
              ['yes', 'Altă cultură'],
              ['no', 'Aceeași cultură'],
            ]}
            onChange={(rotation) => set({ rotation })}
          />
        </Group>
      )}

      {!reading.ok && (
        <p className="ob-err" role="alert">
          {BAD_NUMBER}
        </p>
      )}
      <div className="pf-actions">
        <button type="submit" className="btn btn-dark" disabled={!reading.ok || matching === 0}>
          {showText(matching)}
        </button>
        <div className="pf-row">
          <button type="button" className="btn btn-line" onClick={() => setForm(EMPTY_FORM)}>
            Șterge tot
          </button>
          <button type="button" className="btn btn-line" onClick={onClose}>
            Renunță
          </button>
        </div>
      </div>
    </form>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="pf-group">
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

function Checks<T extends string | number>({ values, chosen, label, onChange }: { values: readonly T[]; chosen: readonly T[]; label: (v: T) => string; onChange: (v: T[]) => void }) {
  return (
    <div className="pf-checks">
      {values.map((v) => (
        <label key={v} className="pf-check">
          <input type="checkbox" checked={chosen.includes(v)} onChange={() => onChange(toggled(chosen, v))} />
          {label(v)}
        </label>
      ))}
    </div>
  );
}

function Radios<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="pf-checks">
      {options.map(([v, text]) => (
        <label key={v} className="pf-check">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          {text}
        </label>
      ))}
    </div>
  );
}

function Between(p: { unit: string; min: string; max: string; badMin: boolean; badMax: boolean; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div className="pf-between">
      <label>
        de la
        <input type="text" inputMode="decimal" value={p.min} aria-invalid={p.badMin} onChange={(e) => p.onMin(e.target.value)} />
      </label>
      <label>
        până la
        <input type="text" inputMode="decimal" value={p.max} aria-invalid={p.badMax} onChange={(e) => p.onMax(e.target.value)} />
      </label>
      <span className="pf-unit">{p.unit}</span>
    </div>
  );
}

function MonthPair({ months, from, to, onFrom, onTo }: { months: readonly string[]; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const pick = (value: string, on: (v: string) => void, word: string) => (
    <label>
      {word}
      <select value={value} onChange={(e) => on(e.target.value)}>
        <option value="">oricând</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="pf-between">
      {pick(from, onFrom, 'din')}
      {pick(to, onTo, 'până în')}
    </div>
  );
}
