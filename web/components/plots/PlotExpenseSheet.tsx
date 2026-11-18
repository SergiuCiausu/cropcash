'use client';
/* „Adaugă cheltuială aici”: an expense on one parcel (docs/harta-plan.md, step 8). It only notes money
   already spent, so without internet it waits in the queue like any other expense. A treatment can also
   note the work it paid for (step 10); that waits in the queue too (step 11). */
import { useRef, useState, type FormEvent } from 'react';
import type { ExpenseCategory } from '../../../packages/shared/src/farm/plan-inputs';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { date, exact, failText } from '../../lib/cc/format';
import { useOnline, useStore } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { EXPENSE_LABELS } from '../../lib/ui/categories';
import { ErrorLine, Sheet } from '../app/bits';
import { NEW_TREATMENT, TreatmentWork, treatmentInput } from './TreatmentWork';

export interface PlotExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  plotId: string;
  plotTitle: string;
  cropId: string | null;
  harvestYear: number;
  today: string;
  /** After it is saved or queued. */
  onSaved: () => void;
}

export function PlotExpenseSheet(props: PlotExpenseSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} className="detail pc-sheet" label="Cheltuială pe parcelă" keepOnBackdrop>
      {props.open ? <ExpenseForm key={props.plotId} {...props} /> : null}
    </Sheet>
  );
}

function ExpenseForm({ onClose, plotId, plotTitle, cropId, harvestYear, today, onSaved }: PlotExpenseSheetProps) {
  const store = useStore()!;
  const online = useOnline();
  const [category, setCategory] = useState<ExpenseCategory>('treatments');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const clientId = useRef(newIntentKey());
  const workId = useRef(newIntentKey());
  const [treatment, setTreatment] = useState(NEW_TREATMENT);
  const work = category === 'treatments' ? treatmentInput(treatment, plotId, harvestYear, day) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lei = amount.trim() ? parseWholeLei(amount) : null;
    if (lei == null || lei <= 0) return setErr(`Scrie suma în lei întregi, de exemplu ${exact(150_000)}.`);
    if (!day || day > today) return setErr('Alege o zi până azi. Cheltuielile de mai târziu le pui în calendar.');
    setErr(null);
    setBusy(true);
    try {
      let workFailed: unknown = null;
      await store.send(async ({ write }) => {
        const r = (await write('add_expense', { category, amountLei: lei, date: day, harvestYear, ...(cropId ? { cropId } : {}), plotId, clientId: clientId.current })) as { id?: string } | undefined;
        if (!work) return;
        /* The money is saved by now; a failed work note doesn't take it back. */
        try {
          await write('add_operation', { ...work, transactionId: r?.id ?? null, clientId: workId.current });
        } catch (e) {
          workFailed = e;
        }
      });
      onSaved();
      if (workFailed) {
        setDone('Am notat cheltuiala.');
        setErr(`Tratamentul nu s-a notat. ${failText(workFailed, online)} Încearcă „Adaugă lucrare”.`);
        return;
      }
      const noted = work ? 'Am notat cheltuiala și tratamentul.' : 'Am notat cheltuiala.';
      setDone(online ? noted : `${noted} Se trimite când ai internet.`);
      setTimeout(onClose, 900);
    } catch (e2) {
      setErr(failText(e2, online));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          Cheltuială pe {plotTitle}
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="ev-fields">
        <label>
          Pe ce
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_LABELS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cât ai plătit (lei)
          <input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={exact(150_000)} />
        </label>
        <label>
          Ziua
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      {category === 'treatments' && <TreatmentWork value={treatment} onChange={setTreatment} />}
      <ErrorLine>{err}</ErrorLine>
      <div className="acts">
        <button type="submit" className="btn btn-dark" disabled={busy || !!done}>
          Notează
        </button>
        <button type="button" className="btn btn-line" onClick={onClose}>
          Renunță
        </button>
        {done && <small role="status">{done}</small>}
        {day && !done && <small className="ev-when">{date(day, true)}</small>}
      </div>
    </form>
  );
}
