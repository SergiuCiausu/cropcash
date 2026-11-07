import { useState } from 'react';
import { ENVELOPE_KINDS, type Envelopes } from '@cropcash/shared';
import { t } from '../../i18n';
import { api, ApiError } from '../../api/client';
import { Sheet } from '../../components/ui';
import { formatLei } from '../../lib/format';
import type { FarmPlan } from '../../lib/plan';

const TONE: Record<keyof Envelopes, { tone: string; color: string }> = {
  salary: { tone: 'lilac', color: '--c1' },
  spring_inputs: { tone: 'butter', color: '--c3' },
  debts: { tone: 'pink', color: '--c2' },
  risk_fund: { tone: 'sky', color: '--c4' },
  pension: { tone: 'mint', color: '--c5' },
};

function EnvelopeBars({ env }: { env: Envelopes }) {
  const max = Math.max(...Object.values(env), 1);
  return (
    <ul className="bars">
      {ENVELOPE_KINDS.map((k) => (
        <li key={k} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <b>{t(`envelopes.kinds.${k}`)}</b>
          <span className="num">
            {formatLei(env[k])} {t('common.lei')}
          </span>
          <span className="track" style={{ gridColumn: '1 / -1' }}>
            <i style={{ width: `${(env[k] / max) * 100}%`, background: `var(${TONE[k].color})` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The five envelopes and "Împarte banii pe plicuri" (docs/06 B3, money on hand for now). */
export function EnvelopesPanel({ plan, onChanged }: { plan: FarmPlan; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(plan.envelopes).reduce((a, b) => a + b, 0);

  const confirm = async () => {
    if (!navigator.onLine) {
      setError(t('offline.needed.save_plan'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/envelopes', { method: 'PUT', body: JSON.stringify(plan.proposal) });
      await onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'too_much' ? t('envelopes.tooMuch') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="phead">
        <h2>{t('envelopes.title')}</h2>
      </div>
      {total > 0 ? <EnvelopeBars env={plan.envelopes} /> : <p className="muted">{t('envelopes.empty')}</p>}
      <p className="fine">{t('envelopes.riskLater', { pct: plan.riskPct })}</p>
      {plan.startBalance > 0 ? (
        <button type="button" className="primary" onClick={() => setOpen(true)}>
          {t('envelopes.split')}
        </button>
      ) : (
        <p className="fine">{t('envelopes.noMoney')}</p>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t('envelopes.splitTitle', { amount: formatLei(plan.startBalance) })}>
        <p className="muted">{t('envelopes.splitLead')}</p>
        <EnvelopeBars env={plan.proposal} />
        <p className="fine">
          {plan.monthsCovered === 1
            ? t('envelopes.splitWhyOne')
            : t('envelopes.splitWhy', { months: plan.monthsCovered })}
        </p>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>
          {busy ? t('common.wait') : t('envelopes.confirm')}
        </button>
      </Sheet>
    </div>
  );
}
