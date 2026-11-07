/* Step 6: the Stripe money flow in the app (test mode). Demo controls only show with VITE_DEMO_MODE=true. */
import { useState } from 'react';
import { t } from '../../i18n';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { cropName, type Farm, type FarmPlan } from '../../lib/plan';
import { formatDayMonth, formatDayMonthYear, formatLei } from '../../lib/format';

export const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

interface AdvanceEvent {
  type: 'salary' | 'income' | 'expense' | 'pension';
  date: string;
  amount: number;
  kind?: string;
  ok: boolean;
}

function eventText(e: AdvanceEvent): string {
  const amount = formatLei(e.amount);
  switch (e.type) {
    case 'salary':
      return e.ok ? t('demo.ev.salary', { amount }) : t('demo.ev.salaryFailed', { amount });
    case 'income':
      return t('demo.ev.income', { amount, what: t(`demo.kinds.${e.kind}`) });
    case 'expense':
      return t('demo.ev.expense', { amount, what: cropName(e.kind) });
    case 'pension':
      return t('demo.ev.pension', { amount });
  }
}

/** Creates the farmer's Stripe account (no Stripe pages for the farmer). */
export function SetupCard({ onChanged, className = '' }: { onChanged: () => Promise<void>; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!navigator.onLine) return setError(t('offline.needed.save_plan'));
    setBusy(true);
    setError(null);
    try {
      await api('/api/stripe/setup', { method: 'POST', body: '{}' });
      await onChanged();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('money.setupTitle')}</h2>
      </div>
      <p className="muted">{t('money.setupBody')}</p>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void run()}>
        {busy ? t('common.wait') : t('money.setupButton')}
      </button>
    </section>
  );
}

/** "Simulează avansul APIA" and "Dăm timpul înainte" (docs/09 demo script). */
export function DemoCard({
  farm,
  plan,
  onChanged,
  onIncome,
  className = '',
}: {
  farm: Farm;
  plan: FarmPlan;
  onChanged: () => Promise<void>;
  onIncome: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AdvanceEvent[]>([]);
  const advanceIn = plan.received.some((r) => r.kind === 'apia_advance');

  const call = async (key: string, path: string, body: object) => {
    if (!navigator.onLine) return setError(t('offline.needed.save_plan'));
    setBusy(key);
    setError(null);
    try {
      const res = await api<{ events?: AdvanceEvent[]; event?: AdvanceEvent }>(path, { method: 'POST', body: JSON.stringify(body) });
      setEvents(res.events ?? (res.event ? [res.event] : []));
      await onChanged();
      if (res.event?.type === 'income') onIncome();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  if (!farm.stripe_account_id) return <SetupCard onChanged={onChanged} className={className} />;

  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('demo.title')}</h2>
        <span>{t('demo.today', { date: formatDayMonthYear(plan.today) })}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-dark"
          disabled={advanceIn || busy !== null}
          onClick={() => void call('income', '/api/demo/income', { kind: 'apia_advance' })}
        >
          {busy === 'income' ? t('common.wait') : advanceIn ? t('demo.advanceReceived') : t('demo.advanceIncome')}
        </button>
        {[1, 3, 6].map((n) => (
          <button
            key={n}
            type="button"
            className="btn btn-line"
            disabled={busy !== null}
            onClick={() => void call(`m${n}`, '/api/demo/advance', { months: n })}
          >
            {busy === `m${n}` ? t('common.wait') : `${t('demo.forward')}: ${n === 1 ? t('demo.oneMonth') : t('demo.months', { n })}`}
            <Icon name="arrow" />
          </button>
        ))}
      </div>
      {busy?.startsWith('m') && <p className="note" style={{ marginTop: 8 }}>{t('demo.running')}</p>}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {events.length > 0 && (
        <>
          <h3 style={{ marginTop: 14, fontSize: 14, fontWeight: 600 }}>{t('demo.resultTitle')}</h3>
          <ul className="rows">
            {events.map((e, i) => (
              <li key={i}>
                <small style={{ color: e.ok ? 'var(--text-1)' : 'var(--bad)', fontSize: 14 }}>{eventText(e)}</small>
                <small>{formatDayMonth(e.date)}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Pension contribution (simulated Pilon III) as a monthly Stripe subscription. Step 7 adds the 65-year simulation. */
export function PensionCard({ farm, plan, onChanged, className = '' }: { farm: Farm; plan: FarmPlan; onChanged: () => Promise<void>; className?: string }) {
  const suggested = Math.max(50, Math.floor(((plan.salary.salary / 100) * 0.05) / 50) * 50);
  const [amount, setAmount] = useState(String(suggested));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = -plan.transactions.filter((tx) => tx.kind === 'pension').reduce((s, tx) => s + tx.amount_bani, 0);

  const start = async () => {
    const monthlyLei = Number(amount.replace(/[.\s]/g, ''));
    if (!Number.isInteger(monthlyLei) || monthlyLei < 10 || monthlyLei > 5000) return setError(t('pension.invalid'));
    if (!navigator.onLine) return setError(t('offline.needed.save_plan'));
    setBusy(true);
    setError(null);
    try {
      await api('/api/pension', { method: 'POST', body: JSON.stringify({ monthlyLei }) });
      await onChanged();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('pension.title')}</h2>
      </div>
      {plan.pensionMonthly > 0 ? (
        <>
          <p className="n20">{t('pension.active', { amount: formatLei(plan.pensionMonthly) })}</p>
          <p className="muted">{t('pension.saved', { amount: formatLei(saved) })}</p>
        </>
      ) : (
        <>
          <p className="muted">{t('pension.lead')}</p>
          {farm.stripe_account_id ? (
            <>
              <label className="field-l">
                {t('pension.amount')}
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
              </label>
              {error && (
                <p role="alert" className="err">
                  {error}
                </p>
              )}
              <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void start()}>
                {busy ? t('common.wait') : t('pension.start')}
              </button>
            </>
          ) : (
            <p className="note" style={{ marginTop: 8 }}>{t('demo.needSetup')}</p>
          )}
        </>
      )}
    </section>
  );
}
