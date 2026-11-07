import { useState } from 'react';
import type { AmountScenario, MonthPlan } from '@cropcash/shared';
import { t } from '../../i18n';
import { Icon, toneOf } from '../../components/Icon';
import { LineChart } from '../../components/LineChart';
import { VerifyBadge } from '../../components/ui';
import { formatLei, formatMonth, formatMonthCap, formatMonthShort, formatMonthYear } from '../../lib/format';
import { cropName, type FarmPlan } from '../../lib/plan';
import { entryTitle } from '../../lib/entryText';
import { balanceSeries } from './HomeView';

const SCENARIOS: AmountScenario[] = ['bad', 'medium', 'good'];
const toSeriesKey = { bad: 'low', medium: 'mid', good: 'high' } as const;

function MonthRow({ m }: { m: MonthPlan }) {
  return (
    <li>
      <div className="mh">
        <b>
          {formatMonthYear(m.key)}
          {m.hard && <span className="hard">{t('forecast.hard')}</span>}
        </b>
        <span className={m.balanceEnd < 0 ? 'out' : ''}>
          {m.balanceEnd < 0
            ? t('forecast.missing', { amount: formatLei(-m.balanceEnd, 100) })
            : t('forecast.left', { amount: formatLei(m.balanceEnd, 100) })}
        </span>
      </div>
      {m.entries.length > 0 && (
        <ul>
          {m.entries.map((e) => (
            <li key={e.id}>
              <span>
                {entryTitle(e)}
                {e.unverified && <VerifyBadge />}
                {e.estimated && <small className="muted"> ({t('calendar.estimated')})</small>}
              </span>
              {e.direction !== 'none' && (
                <span className={e.direction === 'in' ? 'in' : ''}>
                  {e.direction === 'in' ? '+' : '−'}
                  {formatLei(e.value)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ForecastView({ plan }: { plan: FarmPlan }) {
  const [scenario, setScenario] = useState<AmountScenario>('medium');
  const tl = plan.timelines[scenario];
  const last = tl.months.at(-1)!;
  const hard = tl.hardMonths;
  const totalCosts = plan.costs.reduce((s, c) => s + c.amount, 0) || 1;
  const maxCost = plan.costs[0]?.amount ?? 1;

  return (
    <section className="view" aria-label={t('nav.forecast')}>
      <div className="stats-grid split">
        <div className="panel wide">
          <div className="seg" role="group">
            {SCENARIOS.map((s) => (
              <button key={s} type="button" aria-pressed={scenario === s} onClick={() => setScenario(s)}>
                {t(`forecast.scenarios.${s}`)}
              </button>
            ))}
          </div>
          <p className="big" style={{ marginTop: 14 }}>
            {formatLei(last.balanceEnd, 100)} {t('common.lei')}
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            {t('forecast.endLabel', { month: formatMonth(last.key) })}
          </p>
          <LineChart
            band
            active={toSeriesKey[scenario]}
            series={{
              low: balanceSeries(plan.timelines.bad),
              mid: balanceSeries(plan.timelines.medium),
              high: balanceSeries(plan.timelines.good),
            }}
            labels={tl.months.map((m) => formatMonthShort(m.key))}
            label={t('pages.forecast.sub')}
            callout={(i) => (
              <>
                {t('forecast.tightest', { month: formatMonthCap(tl.months[i]!.key) })}
                <b>
                  {formatLei(tl.months[i]!.balanceEnd, 100)} {t('common.lei')}
                </b>
              </>
            )}
          />
          <p className="fine">{t('forecast.fine')}</p>
        </div>

        {plan.costs.length > 0 && (
          <div className="panel">
            <div className="phead">
              <h2>{t('forecast.whereTitle')}</h2>
            </div>
            <ul className="bars">
              {plan.costs.map((c) => {
                const tone = toneOf(c.cropId);
                return (
                  <li key={c.cropId}>
                    <span className="badge" style={{ background: `var(--t-${tone.tone})`, color: `var(--i-${tone.tone})` }}>
                      <Icon name={tone.icon} />
                    </span>
                    <span>
                      <b>{cropName(c.cropId)}</b>
                      <span className="pc">{Math.round((c.amount / totalCosts) * 100)}%</span>
                    </span>
                    <span className="num">
                      {formatLei(c.amount)} {t('common.lei')}
                    </span>
                    <span className="track">
                      <i style={{ width: `${(c.amount / maxCost) * 100}%`, background: `var(${tone.color})` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="panel wide">
          <div className="phead">
            <h2>{t('forecast.monthsTitle')}</h2>
          </div>
          <p style={{ marginBottom: 6 }}>
            {hard.length === 0
              ? t('forecast.noHard')
              : t(tl.lowest.balance < 0 ? 'forecast.hardSummaryMissing' : 'forecast.hardSummary', {
                  from: formatMonth(hard[0]!),
                  to: formatMonth(hard.at(-1)!),
                  low: formatMonth(tl.lowest.key),
                  amount: formatLei(Math.abs(tl.lowest.balance), 100),
                })}
          </p>
          <ul className="months">
            {tl.months.map((m) => (
              <MonthRow key={m.key} m={m} />
            ))}
          </ul>
          <p className="fine">{t('forecast.assumption')}</p>
        </div>
      </div>
    </section>
  );
}
