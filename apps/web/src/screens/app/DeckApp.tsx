/* Phone layout, ported from farm-app/mobile/c-deck.html. */
import { useEffect, useRef, useState } from 'react';
import { upcoming } from '@cropcash/shared';
import { t } from '../../i18n';
import { Icon, type IconName } from '../../components/Icon';
import { ForecastChart } from '../../components/ForecastChart';
import { PaletteMenu } from '../../components/ui';
import { formatDayMonth, formatHa, formatLei, formatMonth, formatMonthCap, todayIso } from '../../lib/format';
import { countyName } from '../../lib/plan';
import { forecastSeries, monthLabels, nextBill, scenarioKey } from '../../lib/view';
import {
  ComingList,
  CostDonut,
  CostRows,
  CropCardBody,
  EnvelopesCard,
  MonthTable,
  RiskFundBody,
  SalaryCta,
  SpringCard,
  SubsidySummary,
} from './blocks';
import type { ShellProps, View } from './AppShell';

const TABS: { id: View; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'forecast', icon: 'chart' },
  { id: 'fields', icon: 'sprout' },
  { id: 'reserve', icon: 'shield' },
];
const SCEN = ['bad', 'medium', 'good'] as const;

function Tile({ icon, k, onClick, vars }: { icon: IconName; k: string; onClick: () => void; vars?: Record<string, string | number> }) {
  return (
    <button type="button" onClick={onClick}>
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

export function DeckApp(p: ShellProps) {
  const { plan, farm, view, go, scenario, setScenario } = p;
  const [first, setFirst] = useState(true);
  const deck = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState(0);
  const tl = plan.timelines.medium;
  const today = todayIso();
  const next = upcoming(tl, today);
  const bill = nextBill(tl, today);
  const sel = plan.timelines[scenario];
  const series = forecastSeries(plan);
  const labels = monthLabels(tl);
  const fundPct = plan.riskTarget ? Math.round((plan.envelopes.risk_fund / plan.riskTarget) * 100) : 0;
  const firstName = farm.name.split(/\s+/)[0] ?? farm.name;
  const heads: Record<View, string> = {
    home: t('pages.home.title', { name: firstName }),
    forecast: t('pages.forecast.title'),
    fields: t('pages.fields.title'),
    reserve: t('pages.reserve.title'),
  };

  useEffect(() => {
    const id = setTimeout(() => setFirst(false), 900);
    return () => clearTimeout(id);
  }, []);

  // Deck dots follow the native scroll position.
  useEffect(() => {
    const el = deck.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setCard([...el.children].indexOf(e.target))),
      { root: el, threshold: 0.6 },
    );
    [...el.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [view]);

  const scrollToCard = (i: number) => {
    const el = deck.current?.children[i] as HTMLElement | undefined;
    if (el && deck.current) deck.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
  };

  const lowLabel = t('forecast.chartLabel', { month: formatMonth(sel.lowest.key), amount: formatLei(sel.lowest.balance, 100) });

  return (
    <div className={`deck-ui${first ? ' first' : ''}`}>
      <div className="hero field">
        <header className="head">
          <div>
            <p>{heads[view]}</p>
            <p className="eyebrow">{t('deck.farmLine', { county: countyName(farm.county), ha: formatHa(plan.totalHa) })}</p>
          </div>
          <PaletteMenu value={p.palette} onChange={p.setPalette} />
          <button type="button" className="avatar" onClick={p.openAccount} aria-label={t('nav.account')}>
            {p.initials}
          </button>
        </header>

        {view === 'home' && (
          <>
            <div className="deck rise" style={{ '--i': 0 } as React.CSSProperties} ref={deck} tabIndex={0}>
              <article className="pcard glass">
                <p className="l">{t('deck.balance')}</p>
                <p className="big">
                  {formatLei(plan.startBalance)} {t('common.lei')}
                </p>
                <ForecastChart className="mini" series={series} active="mid" labels={labels} label={lowLabel} />
              </article>
              <article className="pcard glass">
                <p className="l">{t('deck.riskCard')}</p>
                <p className="big">
                  {formatLei(plan.envelopes.risk_fund)} {t('common.lei')}
                </p>
                <div className="meter">
                  <i style={{ transform: `scaleX(${Math.min(1, fundPct / 100)})` }} />
                </div>
                <div className="spacer" />
                <div className="s">
                  <span>{t('deck.goal')}</span>
                  <b>
                    {formatLei(plan.riskTarget)} {t('common.lei')}
                  </b>
                </div>
              </article>
              <article className="pcard glass">
                <SubsidySummary plan={plan} onOpen={p.openSubsidy} />
              </article>
            </div>
            <div className="dots" role="group" aria-label={t('deck.choose')}>
              {[0, 1, 2].map((i) => (
                <button key={i} type="button" aria-current={card === i ? 'true' : undefined} onClick={() => scrollToCard(i)}>
                  <i />
                </button>
              ))}
            </div>
            <dl className="stats rise" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="glass">
                <dt>{t('stats.tightest')}</dt>
                <dd>{formatMonthCap(tl.lowest.key)}</dd>
                <dd>
                  {formatLei(tl.lowest.balance, 100)} {t('common.lei')}
                </dd>
              </div>
              <div className="glass">
                <dt>{t('stats.nextBill')}</dt>
                <dd>{bill ? formatDayMonth(bill.date) : t('stats.none')}</dd>
                <dd>{bill ? `${formatLei(bill.value)} ${t('common.lei')}` : ''}</dd>
              </div>
              <div className="glass">
                <dt>{t('stats.fund')}</dt>
                <dd>{fundPct}%</dd>
                <dd>{t('stats.ofGoal')}</dd>
              </div>
            </dl>
          </>
        )}

        {view === 'forecast' && (
          <>
            <div className="head" style={{ minHeight: 0, paddingTop: 8 }}>
              <div>
                <p className="eyebrow">{t('forecast.endEyebrow', { month: formatMonth(sel.months.at(-1)!.key) })}</p>
                <p className="big">
                  {formatLei(sel.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                </p>
              </div>
            </div>
            <div className="seg" role="group">
              <span className="thumb" style={{ transform: `translateX(${SCEN.indexOf(scenario) * 100}%)` }} />
              {SCEN.map((s) => (
                <button key={s} type="button" aria-pressed={scenario === s} onClick={() => setScenario(s)}>
                  {t(`forecast.seg.${s}`)}
                </button>
              ))}
            </div>
            <div className="hpanel glass">
              <p className="sub">{t('forecast.chartSub')}</p>
              <ForecastChart className="fchart" series={series} active={scenarioKey[scenario]} labels={labels} label={lowLabel} />
            </div>
            <dl className="stats" style={{ paddingTop: 8 }}>
              <div className="glass">
                <dt>{t('stats.tightest')}</dt>
                <dd>{formatMonthCap(sel.lowest.key)}</dd>
                <dd>
                  {formatLei(sel.lowest.balance, 100)} {t('common.lei')}
                </dd>
              </div>
              <div className="glass">
                <dt>{t('forecast.ifBad')}</dt>
                <dd>
                  {formatLei(plan.timelines.bad.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                </dd>
              </div>
              <div className="glass">
                <dt>{t('forecast.ifGood')}</dt>
                <dd>
                  {formatLei(plan.timelines.good.months.at(-1)!.balanceEnd, 100)} {t('common.lei')}
                </dd>
              </div>
            </dl>
          </>
        )}

        {view === 'fields' && (
          <>
            <div className="head" style={{ minHeight: 0, paddingTop: 8 }}>
              <div>
                <p className="eyebrow">{t('fields.season', { year: tl.months[0]!.key.slice(0, 4) })}</p>
                <p className="big">{t('pages.fields.title')}</p>
              </div>
            </div>
            <dl className="stats" style={{ paddingTop: 12 }}>
              <div className="glass">
                <dt>{t('fields.area')}</dt>
                <dd>{formatHa(plan.totalHa)} ha</dd>
              </div>
              <div className="glass">
                <dt>{t('nav.fields')}</dt>
                <dd>{plan.economics.length}</dd>
              </div>
              <div className="glass">
                <dt>{t('fields.subsidyTitle')}</dt>
                <dd>
                  {formatLei(plan.subsidies.totals.lei.probable, 100)} {t('common.lei')}
                </dd>
              </div>
            </dl>
          </>
        )}

        {view === 'reserve' && (
          <div className="hpanel glass">
            <RiskFundBody plan={plan} />
          </div>
        )}
      </div>

      {view === 'home' && (
        <div className="pad">
          <div className="tiles rise" style={{ '--i': 2 } as React.CSSProperties}>
            <Tile icon="bank" k="subsidy" onClick={p.openSubsidy} />
            <Tile icon="plus" k="credit" onClick={p.openCredit} />
            <Tile icon="shield" k="reserve" onClick={() => go('reserve')} />
            <Tile
              icon="cal"
              k="upcoming"
              vars={{ n: next.length }}
              onClick={() => document.getElementById('coming')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
          </div>
          <SalaryCta plan={plan} onCredit={p.openCredit} onChanged={p.onChanged} className="rise" />
          {plan.costs.length > 0 && (
            <section className="card">
              <div className="card-h">
                <h2>{t('home.seasonCosts')}</h2>
              </div>
              <CostDonut plan={plan} />
            </section>
          )}
          <section className="card" id="coming">
            <div className="card-h">
              <h2>{t('home.comingUp')}</h2>
              <span>{t('home.nextWeeks')}</span>
            </div>
            <ComingList entries={next} />
          </section>
        </div>
      )}

      {view === 'forecast' && (
        <div className="pad">
          {plan.costs.length > 0 && (
            <section className="card" style={{ marginTop: 0 }}>
              <h2>{t('forecast.whereTitle')}</h2>
              <CostRows plan={plan} />
            </section>
          )}
          <section className="card">
            <h2>{t('forecast.monthsTitle')}</h2>
            <MonthTable timeline={sel} />
            <p className="note" style={{ marginTop: 8 }}>
              {t('forecast.fine')}
            </p>
          </section>
        </div>
      )}

      {view === 'fields' && (
        <>
          <div className="crops" tabIndex={0}>
            {plan.economics.map((e) => (
              <article key={e.cropId}>
                <CropCardBody e={e} />
              </article>
            ))}
          </div>
          <div className="pad" style={{ paddingTop: 0 }}>
            <p className="note" style={{ marginTop: 12 }}>
              {t('fields.note')}
            </p>
          </div>
        </>
      )}

      {view === 'reserve' && (
        <div className="pad">
          <SpringCard plan={plan} />
          <EnvelopesCard plan={plan} onChanged={p.onChanged} />
        </div>
      )}

      <nav className="tabs" aria-label={t('nav.menu')}>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" aria-current={view === tab.id ? 'page' : undefined} onClick={() => go(tab.id)}>
            <Icon name={tab.icon} />
            {t(`nav.${tab.id}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}
