/* Laptop layout, ported from farm-app/desktop/2-rail.html (+ desktop.css, desktop.js). */
import { upcoming } from '@cropcash/shared';
import { t } from '../../i18n';
import { Icon, type IconName } from '../../components/Icon';
import { ForecastChart } from '../../components/ForecastChart';
import { Logo, PaletteMenu } from '../../components/ui';
import { formatHa, formatLei, formatMonth, formatMonthCap, formatToday, todayIso } from '../../lib/format';
import { countyName } from '../../lib/plan';
import { forecastSeries, monthLabels, scenarioKey } from '../../lib/view';
import {
  ComingList,
  CostDonut,
  CostRows,
  CropCardBody,
  EnvelopesCard,
  MarginBars,
  MonthTable,
  RiskFundBody,
  SalaryCta,
  SpringCard,
  SubsidySummary,
} from './blocks';
import type { ShellProps, View } from './AppShell';

const NAV: { id: View; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'forecast', icon: 'chart' },
  { id: 'fields', icon: 'sprout' },
  { id: 'reserve', icon: 'shield' },
];
const SCEN = ['bad', 'medium', 'good'] as const;

function Tile({
  icon,
  k,
  tone = '',
  onClick,
  vars,
}: {
  icon: IconName;
  k: string;
  tone?: string;
  onClick: () => void;
  vars?: Record<string, string | number>;
}) {
  return (
    <button type="button" className={tone} onClick={onClick}>
      <span className="i">
        <Icon name={icon} />
      </span>
      <span className="go">
        <Icon name="arrow" />
      </span>
      <span className="t">
        <b>{t(`tiles.${k}.t`)}</b>
        <small>{t(`tiles.${k}.s`, vars)}</small>
      </span>
    </button>
  );
}

export function RailApp(p: ShellProps) {
  const { plan, farm, view, go, scenario, setScenario } = p;
  const tl = plan.timelines.medium;
  const sel = plan.timelines[scenario];
  const next = upcoming(tl, todayIso());
  const series = forecastSeries(plan);
  const labels = monthLabels(tl);
  const firstName = farm.name.split(/\s+/)[0] ?? farm.name;
  const fundPct = plan.riskTarget ? Math.min(1, plan.envelopes.risk_fund / plan.riskTarget) : 0;
  const lowLabel = t('forecast.chartLabel', { month: formatMonth(sel.lowest.key), amount: formatLei(sel.lowest.balance, 100) });

  return (
    <div className="rail-ui">
      <aside className="rail field">
        <Logo />
        <nav aria-label={t('nav.menu')}>
          {NAV.map((n) => (
            <button key={n.id} type="button" aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              {t(`nav.${n.id}`)}
            </button>
          ))}
        </nav>
        <div className="farm glass">
          <b>{farm.name}</b>
          {t('nav.farmSide', { ha: formatHa(plan.totalHa), county: countyName(farm.county) })}
          <br />
          {t('nav.asOf', { date: formatToday() })}
          <div className="row">
            <span>{t('palette.title')}</span>
            <PaletteMenu value={p.palette} onChange={p.setPalette} up />
          </div>
          <div className="row">
            <span>{t('nav.account')}</span>
            <button type="button" className="linkbtn" onClick={p.openAccount}>
              {p.initials}
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div>
          <header className="page-h">
            <div>
              <h1>{t(`pages.${view}.title`, { name: firstName })}</h1>
              <p className="lead">{t(`pages.${view}.sub`)}</p>
            </div>
            <div className="acts">
              <button type="button" className="btn btn-line" onClick={p.openSubsidy}>
                {t('tiles.subsidy.t')}
              </button>
              <button type="button" className="btn btn-dark" onClick={p.openCredit}>
                {t('salary.takeCredit')} <Icon name="arrow" />
              </button>
            </div>
          </header>

          {view === 'home' && (
            <>
              <div className="bento">
                <section className="card acct field s6">
                  <p className="lbl">{t('deck.balance')}</p>
                  <p className="n28">
                    {formatLei(plan.startBalance)} {t('common.lei')}
                  </p>
                  <ForecastChart series={series} active="mid" labels={labels} label={lowLabel} />
                </section>
                <section className="card acct s3">
                  <p className="lbl">{t('deck.riskCard')}</p>
                  <p className="n20">
                    {formatLei(plan.envelopes.risk_fund)} {t('common.lei')}
                  </p>
                  <div className="meter">
                    <i style={{ transform: `scaleX(${fundPct.toFixed(4)})` }} />
                  </div>
                  <div className="spacer" />
                  <div className="kv">
                    <span>{t('deck.goal')}</span>
                    <b>
                      {formatLei(plan.riskTarget)} {t('common.lei')}
                    </b>
                  </div>
                  <div className="kv">
                    <span>{t('stats.tightest')}</span>
                    <b>{formatMonthCap(tl.lowest.key)}</b>
                  </div>
                </section>
                <section className="card acct s3">
                  <SubsidySummary plan={plan} onOpen={p.openSubsidy} />
                </section>
              </div>
              <div className="tiles gap">
                <Tile icon="shield" k="reserve" tone="t-b" onClick={() => go('reserve')} />
                <Tile icon="chart" k="forecast" onClick={() => go('forecast')} />
                <Tile
                  icon="cal"
                  k="upcoming"
                  tone="t-c"
                  vars={{ n: next.length }}
                  onClick={() => document.getElementById('coming')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                />
                <Tile icon="sprout" k="fields" onClick={() => go('fields')} />
              </div>
              <div className="bento gap">
                <section className="card s7" id="coming">
                  <div className="card-h">
                    <h2>{t('home.comingUp')}</h2>
                    <span>{t('home.nextWeeks')}</span>
                  </div>
                  <ComingList entries={next} />
                </section>
                <SalaryCta plan={plan} onCredit={p.openCredit} onChanged={p.onChanged} className="s5" />
                {plan.costs.length > 0 && (
                  <section className="card s5">
                    <div className="card-h">
                      <h2>{t('home.seasonCosts')}</h2>
                    </div>
                    <CostDonut plan={plan} />
                  </section>
                )}
                <SpringCard plan={plan} className="s7" />
              </div>
            </>
          )}

          {view === 'forecast' && (
            <div className="bento">
              <section className="chart-card field s8">
                <div className="lead-row">
                  <div>
                    <p className="sub" style={{ fontSize: 13, fontWeight: 500 }}>
                      {t('forecast.endEyebrow', { month: formatMonth(sel.months.at(-1)!.key) })}
                    </p>
                    <p className="n28">
                      {formatLei(sel.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                    </p>
                  </div>
                  <div className="seg" role="group">
                    {SCEN.map((s) => (
                      <button key={s} type="button" aria-pressed={scenario === s} onClick={() => setScenario(s)}>
                        {t(`forecast.seg.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <ForecastChart className="big" series={series} active={scenarioKey[scenario]} labels={labels} label={lowLabel} />
                <ul className="ch-leg">
                  <li>
                    <i className="l" />
                    {t('forecast.legSelected')}
                  </li>
                  <li>
                    <i className="r" />
                    {t('forecast.legBand')}
                  </li>
                  <li>
                    <i className="d" />
                    {t('forecast.legDot')}
                  </li>
                </ul>
              </section>
              <div className="s4 side-stats">
                <section className="card kpi">
                  <p className="lbl">{t('forecast.kpiTightest')}</p>
                  <p className="n20">{formatMonthCap(sel.lowest.key)}</p>
                  <p className="sub2">
                    {formatLei(sel.lowest.balance, 100)} {t('common.lei')}
                  </p>
                </section>
                <section className="card kpi">
                  <p className="lbl">{t('forecast.ifBad')}</p>
                  <p className="n20">
                    {formatLei(plan.timelines.bad.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                  </p>
                </section>
                <section className="card kpi">
                  <p className="lbl">{t('forecast.ifGood')}</p>
                  <p className="n20">
                    {formatLei(plan.timelines.good.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                  </p>
                </section>
              </div>
              {plan.costs.length > 0 && (
                <section className="card s12">
                  <div className="card-h">
                    <h2>{t('forecast.whereTitle')}</h2>
                  </div>
                  <CostRows plan={plan} className="cost-grid" />
                </section>
              )}
              <section className="card s12">
                <div className="card-h">
                  <h2>{t('forecast.monthsTitle')}</h2>
                </div>
                <MonthTable timeline={sel} />
                <p className="note" style={{ marginTop: 12 }}>
                  {t('forecast.fine')}
                </p>
              </section>
            </div>
          )}

          {view === 'fields' && (
            <>
              <section className="card" style={{ marginBottom: 16 }}>
                <div className="card-h">
                  <h2>{t('fields.marginTitle')}</h2>
                  <span>{t('fields.season', { year: tl.months[0]!.key.slice(0, 4) })}</span>
                </div>
                <MarginBars plan={plan} />
              </section>
              <div className="g3">
                {plan.economics.map((e) => (
                  <article className="card crop" key={e.cropId}>
                    <CropCardBody e={e} />
                  </article>
                ))}
              </div>
              <p className="note" style={{ marginTop: 16 }}>
                {t('fields.note')}
              </p>
            </>
          )}

          {view === 'reserve' && (
            <div className="bento">
              <section className="cta field s5">
                <RiskFundBody plan={plan} />
              </section>
              <EnvelopesCard plan={plan} onChanged={p.onChanged} className="s7 span2" />
              <SpringCard plan={plan} className="s5" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
