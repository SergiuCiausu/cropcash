import { t } from '../../i18n';
import { formatLei, formatMonth } from '../../lib/format';
import type { FarmPlan } from '../../lib/plan';
import { EnvelopesPanel } from './EnvelopesPanel';

export function ReservesView({ plan, onChanged }: { plan: FarmPlan; onChanged: () => Promise<void> }) {
  const saved = plan.envelopes.risk_fund;
  const { spring } = plan;
  const shortBy = spring.need - spring.available;

  return (
    <section className="view" aria-label={t('nav.reserve')}>
      <div className="res-grid split">
        <div className="res">
          <small>{t('reserve.badYearTitle')}</small>
          <span className="amt">
            {formatLei(saved)} {t('common.lei')}
          </span>
          <div className="meter">
            <i style={{ width: `${plan.riskTarget ? Math.min(100, (saved / plan.riskTarget) * 100) : 0}%` }} />
          </div>
          <div className="row">
            <span>{t('reserve.badYearHave')}</span>
            <span>{t('reserve.badYearOf', { amount: formatLei(plan.riskTarget) })}</span>
          </div>
          <p>{t('reserve.badYearWhy', { amount: formatLei(plan.riskTarget) })}</p>
        </div>

        <div className="res alt">
          {spring.firstMonth && spring.lastMonth ? (
            <>
              <small>
                {t('reserve.springTitle', { from: formatMonth(spring.firstMonth), to: formatMonth(spring.lastMonth) })}
              </small>
              <span className="amt">
                {formatLei(spring.need)} {t('common.lei')}
              </span>
              <p>{t('reserve.springHave', { amount: formatLei(spring.available, 100) })}</p>
              <p>
                <b>
                  {shortBy > 0
                    ? t('reserve.springShort', { amount: formatLei(shortBy, 100) })
                    : t('reserve.springOk')}
                </b>
              </p>
            </>
          ) : (
            <p>{t('reserve.springNone')}</p>
          )}
        </div>
      </div>
      <EnvelopesPanel plan={plan} onChanged={onChanged} />
      <p className="note">{t('reserve.note')}</p>
    </section>
  );
}
