'use client';
/* „Animalele fermei” on /rapoarte → „Pentru APIA” (docs/rapoarte-apia-plan.md, phase 3): the heads per category of
   the cerere's field 47, the ANSVSA code, the dairy cows and the hay. They fill the animal declaration, the diesel
   Anexa 3, the hay proof and the PD-07 / PD-27 decont. Signed in they're saved on the farm (needs internet); on
   Ion's farm they stay on the phone. */
import { useState } from 'react';
import type { Livestock } from '../../../packages/shared/src/reports/index';
import { failText } from '../../lib/cc/format';
import { useFarm, useOnline, useStore } from '../../lib/cc/react';
import { LIVESTOCK } from '../../lib/reports/apia-filings';
import { ErrorLine, NetButton } from '../app/bits';

type Form = { counts: Record<string, string>; ansvsa: string; dairy: string; hay: string };

const whole = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? +s.trim() : NaN);
/** „12,5” t → 125 tenths. */
const tenths = (s: string) => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d)?$/.test(t) ? Math.round(+t * 10) : NaN;
};

function formOf(l: Livestock | null, year: number): Form {
  return {
    counts: Object.fromEntries(LIVESTOCK.categories.map((c) => [c.id, l?.counts[c.id] ? String(l.counts[c.id]) : ''])),
    ansvsa: l?.ansvsaCode ?? '',
    dairy: l?.dairyCows ? String(l.dairyCows) : '',
    hay: l?.hay && l.hay.year === year ? String(l.hay.tenthsTonnes / 10).replace('.', ',') : '',
  };
}

/** The form's livestock, or the first thing wrong with it, in the farmer's words. */
function read(f: Form, year: number, before: Livestock | null): Livestock | string {
  const counts: Record<string, number> = {};
  for (const c of LIVESTOCK.categories) {
    const n = whole(f.counts[c.id] ?? '');
    if (Number.isNaN(n)) return `${c.label_ro}: scrie un număr întreg.`;
    if (n) counts[c.id] = n;
  }
  const dairy = whole(f.dairy);
  if (Number.isNaN(dairy)) return 'Vacile de lapte: scrie un număr întreg.';
  if (dairy > (counts.bovine_over_2y ?? 0)) return 'Vacile de lapte sunt mai multe decât bovinele peste 2 ani.';
  const code = f.ansvsa.trim();
  if (code && !/^[A-Za-z0-9]{4,20}$/.test(code)) return 'Codul ANSVSA: doar litere și cifre, fără spații.';
  const hay = tenths(f.hay);
  if (Number.isNaN(hay)) return 'Fânul: scrie tonele, cu cel mult o zecimală (de exemplu 12,5).';
  /* Hay of another year stays as it was. */
  const keptHay = before?.hay && before.hay.year !== year ? before.hay : null;
  return { counts, ansvsaCode: code || null, dairyCows: dairy || null, hay: hay === null ? keptHay : { year, tenthsTonnes: hay } };
}

export function AnimalsCard({ year, grassland }: { year: number; grassland: boolean }) {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const [f, setF] = useState<Form>(() => formOf(farm.livestock, year));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    const next = read(f, year, farm.livestock);
    if (typeof next === 'string') return setErr(next);
    setBusy(true);
    setErr('');
    setSaved(false);
    try {
      await store.setLivestock(next);
      setSaved(true);
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }
  const set = (patch: Partial<Form>) => {
    setSaved(false);
    setF({ ...f, ...patch });
  };

  return (
    <section className="card s12" aria-labelledby="apia-animals">
      <div className="card-h">
        <h2 id="apia-animals">Animalele fermei</h2>
      </div>
      <p className="note">În capete, pe categoriile din cererea APIA. Le folosesc declarația pentru animale, motorina (Anexa 3), dovada pentru fân și decontul PD-07 / PD-27. Lasă gol ce n-ai.</p>
      <div className="apia-grid">
        {LIVESTOCK.categories.map((c) => (
          <label key={c.id} className="ob-field">
            {c.label_ro}
            {c.unit_ro !== 'capete' && ` (${c.unit_ro})`}
            <input inputMode="numeric" autoComplete="off" value={f.counts[c.id] ?? ''} onChange={(e) => set({ counts: { ...f.counts, [c.id]: e.target.value } })} />
          </label>
        ))}
      </div>
      <div className="apia-grid">
        <label className="ob-field">
          Din bovinele peste 2 ani, vaci de lapte
          <input inputMode="numeric" autoComplete="off" value={f.dairy} onChange={(e) => set({ dairy: e.target.value })} />
        </label>
        <label className="ob-field">
          Codul exploatației (ANSVSA)
          <input autoComplete="off" autoCapitalize="characters" maxLength={20} value={f.ansvsa} onChange={(e) => set({ ansvsa: e.target.value })} />
        </label>
        {grassland && (
          <label className="ob-field">
            Fânul strâns în campania {year} (tone)
            <input inputMode="decimal" autoComplete="off" value={f.hay} onChange={(e) => set({ hay: e.target.value })} />
          </label>
        )}
      </div>
      <ErrorLine>{err}</ErrorLine>
      {saved && (
        <p className="note" role="status">
          Am salvat. Hârtiile de mai sus s-au potrivit cu animalele tale.
        </p>
      )}
      <div className="ob-actions">
        {farm.me ? (
          <NetButton reason="Animalele se salvează pe fermă, cu internet." className="btn btn-dark" disabled={busy} onClick={() => void save()}>
            {busy ? 'Se salvează…' : 'Salvează animalele'}
          </NetButton>
        ) : (
          <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void save()}>
            {busy ? 'Se salvează…' : 'Salvează animalele'}
          </button>
        )}
      </div>
    </section>
  );
}
