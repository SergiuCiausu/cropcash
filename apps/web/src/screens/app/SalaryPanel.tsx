import { useState } from 'react';
import { addMonths, CreditInputSchema } from '@cropcash/shared';
import { t } from '../../i18n';
import { api } from '../../api/client';
import { Sheet } from '../../components/ui';
import { currentMonthKey, formatLei, formatMonth, formatMonthYear, formatMonthYearLower } from '../../lib/format';
import type { FarmPlan } from '../../lib/plan';

/** Months the farmer can pick: from now, `count` months on. */
const monthOptions = (from: string, count: number) => Array.from({ length: count }, (_, i) => addMonths(from, i));

function CreditSheet({
  open,
  onClose,
  onSaved,
  suggestion,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  suggestion: FarmPlan['creditSuggestion'];
}) {
  const now = currentMonthKey();
  const defaultTake = suggestion?.credit.takeMonth ?? addMonths(now, 1);
  const [amount, setAmount] = useState(suggestion ? String(suggestion.credit.amount / 100) : '');
  const [take, setTake] = useState(defaultTake);
  const [repay, setRepay] = useState(addMonths(defaultTake, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body = { amountLei: Number(amount.replace(/[.\s]/g, '')), takeMonth: take, repayMonth: repay };
    if (!CreditInputSchema.safeParse(body).success) {
      setError(t('credit.invalid'));
      return;
    }
    if (!navigator.onLine) {
      setError(t('offline.needed.save_plan'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/credits', { method: 'POST', body: JSON.stringify(body) });
      await onSaved();
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('credit.title')}>
      <label className="field">
        {t('credit.amount')}
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.\s]/g, ''))} />
      </label>
      <label className="field">
        {t('credit.take')}
        <select className="input" value={take} onChange={(e) => setTake(e.target.value)}>
          {monthOptions(now, 12).map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('credit.repay')}
        <select className="input" value={repay} onChange={(e) => setRepay(e.target.value)}>
          {monthOptions(addMonths(take, 1), 18).map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(m)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{t('credit.note')}</p>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
        {busy ? t('common.wait') : t('credit.save')}
      </button>
    </Sheet>
  );
}

/** "Salariul tău": safe monthly amount, the credit suggestion (A) and declared credits (C). */
export function SalaryPanel({ plan, onChanged }: { plan: FarmPlan; onChanged: () => Promise<void> }) {
  const [creditOpen, setCreditOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { salary, creditSuggestion: s } = plan;

  const remove = async (groupId: string) => {
    if (!navigator.onLine) return;
    setRemoving(groupId);
    try {
      await api(`/api/credits/${groupId}`, { method: 'DELETE' });
      await onChanged();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="panel wide">
      <div className="phead">
        <h2>{t('salary.title')}</h2>
      </div>
      <p className="big">
        {formatLei(salary.salary)} <span style={{ fontSize: 17, fontWeight: 500 }}>{t('salary.perMonth')}</span>
      </p>
      <p className="muted" style={{ marginTop: 4 }}>
        {salary.deficit
          ? t('salary.deficit', { month: formatMonth(salary.bindingMonth) })
          : t('salary.why', { month: formatMonth(salary.bindingMonth) })}
      </p>

      {s && (
        <div className="ok" style={{ marginTop: 14 }}>
          <b style={{ display: 'block' }}>{t('salary.suggestTitle')}</b>
          {t('salary.suggest', {
            credit: formatLei(s.credit.amount),
            month: formatMonth(s.credit.takeMonth ?? ''),
            salary: formatLei(s.salary),
          })}
          <span className="hint" style={{ display: 'block', color: 'inherit', opacity: 0.85 }}>
            {t('salary.suggestNote')}
          </span>
        </div>
      )}

      {plan.credits.length > 0 && (
        <>
          <h3 style={{ marginTop: 16, fontSize: 15, fontWeight: 700 }}>{t('salary.declaredTitle')}</h3>
          <ul className="rows">
            {plan.credits.map((c) => (
              <li key={c.groupId} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <small style={{ color: 'var(--ink)', fontSize: 14.5 }}>
                  {t('salary.declared', {
                    amount: formatLei(c.amount),
                    take: formatMonthYearLower(c.takeDate.slice(0, 7)),
                    repay: c.repayDate ? formatMonthYearLower(c.repayDate.slice(0, 7)) : '—',
                  })}
                </small>
                <button
                  type="button"
                  className="link"
                  disabled={removing === c.groupId}
                  aria-label={t('salary.removeLabel', { amount: formatLei(c.amount) })}
                  onClick={() => void remove(c.groupId)}
                >
                  {t('salary.remove')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setCreditOpen(true)}>
        {t('salary.takeCredit')}
      </button>

      {creditOpen && (
        <CreditSheet open onClose={() => setCreditOpen(false)} onSaved={onChanged} suggestion={s} />
      )}
    </div>
  );
}
