import { upcoming, type Timeline } from '@cropcash/shared';
import { t } from '../../i18n';
import { Icon, toneOf } from '../../components/Icon';
import { Strands } from '../../components/Strands';
import { LineChart } from '../../components/LineChart';
import { Donut } from '../../components/Donut';
import { VerifyBadge } from '../../components/ui';
import { formatDayMonth, formatLei, formatMonthCap, formatMonthShort, todayIso } from '../../lib/format';
import { cropName, type FarmPlan } from '../../lib/plan';
import { entryBadge, entryTitle } from '../../lib/entryText';
import type { View } from './AppShell';
import { SalaryPanel } from './SalaryPanel';

export const balanceSeries = (s: Timeline) => [s.startBalance, ...s.months.map((m) => m.balanceEnd)];

export function HomeView({
  plan,
  go,
  openSubsidy,
  onChanged,
}: {
  plan: FarmPlan;
  go: (v: View) => void;
  openSubsidy: () => void;
  onChanged: () => Promise<void>;
}) {
  const tl = plan.timelines.medium;
  const next = upcoming(tl, todayIso());
  const totalCosts = plan.costs.reduce((s, c) => s + c.amount, 0);

  return (
    <section className="view" aria-label={t('nav.home')}>
      <div className="home-grid split">
        <div className="bal h-bal wide">
          <Strands />
          <div>
            <small>{t('home.balance')}</small>
            <span className="amt">
              {formatLei(plan.startBalance)} {t('common.lei')}
            </span>
          </div>
          <div className="row">
            <div>
              <small>{t('home.tightest')}</small>
              <b>
                {formatMonthCap(tl.lowest.key)}, {formatLei(tl.lowest.balance, 100)} {t('common.lei')}
              </b>
            </div>
            <span className="pill">{t('common.estimated')}</span>
          </div>
        </div>

        <div className="panel h-lean only-wide">
          <div className="phead">
            <h2>{t('home.willItLast')}</h2>
            <button className="link" type="button" onClick={() => go('forecast')}>
              {t('home.seeForecast')}
            </button>
          </div>
          <LineChart
            mini
            band={false}
            active="mid"
            series={{
              low: balanceSeries(plan.timelines.bad),
              mid: balanceSeries(tl),
              high: balanceSeries(plan.timelines.good),
            }}
            labels={tl.months.map((m) => formatMonthShort(m.key))}
            label={t('home.willItLast')}
          />
        </div>

        <div className="quick wide" role="group">
          <button type="button" onClick={openSubsidy}>
            <span>
              <Icon name="bank" />
            </span>
            {t('home.quick.subsidy')}
          </button>
          <button
            type="button"
            onClick={() => document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            <span>
              <Icon name="cal" />
            </span>
            {t('home.quick.upcoming')}
          </button>
          <button type="button" onClick={() => go('reserve')}>
            <span>
              <Icon name="shield" />
            </span>
            {t('home.quick.reserve')}
          </button>
          <button type="button" onClick={() => go('forecast')}>
            <span>
              <Icon name="bars" />
            </span>
            {t('home.quick.forecast')}
          </button>
        </div>

        <SalaryPanel plan={plan} onChanged={onChanged} />

        {plan.costs.length > 0 && (
          <div className="panel">
            <div className="phead">
              <h2>{t('home.seasonCosts')}</h2>
            </div>
            <Donut
              center={formatLei(totalCosts)}
              centerLabel={t('home.total')}
              slices={plan.costs.map((c) => ({
                key: c.cropId,
                label: cropName(c.cropId),
                value: c.amount,
                color: toneOf(c.cropId).color,
              }))}
            />
          </div>
        )}

        <div className="panel" id="upcoming">
          <div className="phead">
            <h2>{t('home.comingUp')}</h2>
            <small>{t('home.nextWeeks')}</small>
          </div>
          <ul className="rows">
            {next.map((e) => {
              const b = entryBadge(e);
              return (
                <li key={e.id}>
                  <span className="badge" style={{ background: `var(--t-${b.tone})`, color: `var(--i-${b.tone})` }}>
                    <Icon name={b.icon} />
                  </span>
                  <div>
                    <b>
                      {entryTitle(e)}
                      {e.unverified && <VerifyBadge />}
                    </b>
                    <small>
                      {e.kind === 'deadline'
                        ? t('calendar.until', { date: formatDayMonth(e.date) })
                        : formatDayMonth(e.date)}
                      {e.estimated && `, ${t('calendar.estimated')}`}
                    </small>
                  </div>
                  <div className={`num ${e.direction === 'in' ? 'in' : ''}`}>
                    {e.direction !== 'none' && (
                      <>
                        {e.direction === 'in' ? '+' : '−'}
                        {formatLei(e.value)} {t('common.lei')}
                      </>
                    )}
                    {e.window && <small>{t('common.estimated')}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
