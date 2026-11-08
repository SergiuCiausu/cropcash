'use client';
/* Acasă: the salary, the money on hand, what comes next and the calls worth a look (was
   web/legacy/acasa.js). Everything is calculated here from the saved farm, so it works without
   internet. The weather needs a farm on the server; offline it shows the last saved copy. */
import { useEffect, useMemo, useState } from 'react';
import { todayInRomania } from '../../../packages/shared/src/cashflow/dates';
import { salaryBreakdown } from '../../../packages/shared/src/functions/explain';
import { pensionParams, simulatePensionScenarios } from '../../../packages/shared/src/pension/index';
import { isFrost, upcomingWeather, weatherAlerts, WeatherForecastSchema, type WeatherDay } from '../../../packages/shared/src/weather/index';
import { date, daysLeft, exact, ha, num, zile } from '../../lib/cc/format';
import { harvestName } from '../../lib/cc/harvests';
import { callName } from '../../lib/cc/monitor';
import { useFarm, useMoney, useMonitor, useMonitorRefresh, useOnline, useStore, useView } from '../../lib/cc/react';
import { pageFits } from '../../lib/live/monitor';
import { chartRows, cropChartRows, monthName, yearEnds } from '../../lib/ui/chart';
import type { IconName } from '../../lib/ui/icons';
import { Icon, OfflineNote, useHref } from '../app/bits';
import { CropBreakdown } from '../app/CropBreakdown';
import FarmChart from '../app/FarmChart';
import { PageLink } from '../app/Frame';

const MAX_ROWS = 5;
const MAX_CALLS = 5;
const WEATHER_KEY = 'cropcash.weather';

type View = NonNullable<ReturnType<typeof useView>>;
type Plan = ReturnType<View['farmPlan']>;
type Forecast = ReturnType<typeof WeatherForecastSchema.parse>;

const useLei = () => {
  const { text } = useMoney();
  return (bani: number) => text(`${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`);
};

/** The salary and the month-by-month line. */
function SalaryHero({ view, plan, nextMoney }: { view: View; plan: Plan; nextMoney: { value: number; date: string } | null }) {
  const lei = useLei();
  const t = plan.timelines.medium;
  const salary = salaryBreakdown(plan, 'medium', view.data());
  const rows = chartRows(plan, 'medium');
  const low = rows.find((r) => r.long === monthName(t.lowest.key))!;
  return (
    <section className="card chart-card hero-card s8">
      <p className="eyebrow">Salariul tău</p>
      <p className="amount">{lei(plan.monthlySalary)} pe lună</p>
      <p className="why">{salary.deficit ? `În ${monthName(salary.limitingMonth!)} banii nu ajung.` : nextMoney ? `Următorii bani: ${lei(nextMoney.value)}, pe ${date(nextMoney.date).replace(/[.]$/, '')}.` : ''}</p>
      <FarmChart className="chart fc-chart" id="fc" rows={rows} low={low} year="medium" label={`Banii tăi lună de lună. Cel mai jos: ${lei(low.v)}, în ${low.long}. La final, ${yearEnds(rows, 'medium', lei)}.`} />
    </section>
  );
}

/** The money on hand, and what the plan puts aside (the same sum as "Contul tău"). */
function SideStats({ view, plan }: { view: View; plan: Plan }) {
  const lei = useLei();
  const href = useHref();
  const t = plan.timelines.medium;
  const P = pensionParams(view.data());
  const monthly = plan.smoothing.pensionMonthly ?? 0;
  const sim = monthly > 0 ? simulatePensionScenarios(view.farm.age, monthly, P) : null;
  const roundBani = P.roundLei * 100;
  return (
    <div className="s4 side-stats ac-side">
      <section className="card kpi">
        <p className="lbl">Bani la tine acum</p>
        <p className="n20">{lei(plan.startBalance)}</p>
        <p className="sub2">
          Cel mai jos: {lei(t.lowest.balance)}, în {monthName(t.lowest.key)}
        </p>
      </section>{' '}
      <PageLink className="card kpi kpi-link" path="/pensie" href={href('/pensie')}>
        <p className="lbl">Pensie</p>
        <p className="n20">{monthly > 0 ? `${lei(monthly)} pe lună` : 'Nimic deocamdată'}</p>
        <p className="sub2">{sim ? `La ${P.targetAge} de ani: ${lei(Math.floor(sim.atTarget.probable / roundBani) * roundBani)}` : monthly > 0 ? `Pui ${lei(monthly)} pe lună.` : 'Nu pui încă nimic deoparte.'}</p>
      </PageLink>
    </div>
  );
}

/** One crop's tab: what it leaves over the whole harvest year, in place of the salary and the account. */
function CropSummary({ view, crop }: { view: View; crop: NonNullable<View['tabbedCrop']> }) {
  const lei = useLei();
  const row = view.cropBreakdown().rows.find((r) => r.cropId === crop.id)!;
  const rows = cropChartRows(view.harvestYearPlan(), crop.months, 'medium');
  const low = rows.reduce((a, b) => (b.v < a.v ? b : a));
  const word = crop.name.toLowerCase();
  return (
    <>
      <section className="card chart-card hero-card s8">
        <p className="eyebrow">Ce rămâne din {word}</p>
        <p className="amount">{lei(row.leftBani)}</p>
        <p className="why">
          Adică {lei(Math.round((row.leftBani * 100) / crop.ari))} pe hectar, pe toată {harvestName(view.scoped)}.
        </p>
        <FarmChart className="chart fc-chart" id="fc" rows={rows} low={low} year="medium" label={`Ce a adus cultura de ${word} minus ce a costat, lună de lună. La final: ${lei(rows[rows.length - 1].v)}.`} />
      </section>
      <div className="s4 side-stats ac-side">
        <section className="card kpi">
          <p className="lbl">Intră</p>
          <p className="n20">{lei(row.inBani)}</p>
          <p className="sub2">Vânzări și partea de la APIA</p>
        </section>{' '}
        <section className="card kpi">
          <p className="lbl">Ies</p>
          <p className="n20">{lei(row.outBani)}</p>
          <p className="sub2">Pe {ha(row.areaAri)} ha</p>
        </section>
      </div>
    </>
  );
}

function Weather({ view }: { view: View }) {
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const data = view.data();
  const wx = data.params.weather;
  const county = farm.me!.county as string;
  const realToday = todayInRomania(new Date());
  const seat = data.counties.counties.find((c) => c.code === county)?.seat_ro;
  const kept = useMemo(() => {
    try {
      const parsed = WeatherForecastSchema.safeParse(JSON.parse(localStorage.getItem(WEATHER_KEY) ?? 'null'));
      return parsed.success && parsed.data.countyCode === county ? parsed.data : null;
    } catch {
      return null;
    }
  }, [county]);
  const [state, setState] = useState<{ forecast: Forecast | null; failed: boolean }>({ forecast: kept, failed: false });
  useEffect(() => {
    let live = true;
    store.live
      .api('/api/weather')
      .then((raw) => {
        const fresh = WeatherForecastSchema.parse(raw);
        try {
          localStorage.setItem(WEATHER_KEY, JSON.stringify(fresh));
        } catch {
          /* shown for this visit */
        }
        if (live) setState({ forecast: fresh, failed: false });
      })
      .catch(() => live && setState({ forecast: kept, failed: true }));
    return () => {
      live = false;
    };
  }, [store, kept]);

  const { forecast, failed } = state;
  const days = forecast ? upcomingWeather(forecast.days, realToday) : [];
  const title = `Vremea în ${view.farm.county}`;
  if (!days.length)
    return (
      <section className="card s12">
        <h2>{title}</h2>
        {!failed ? (
          <>
            <p className="sr-only" role="status">
              Se încarcă vremea…
            </p>
            <div className="wx-wait" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="bone" style={{ height: 14 }} />
              ))}
            </div>
          </>
        ) : (
          <p className="note">{online ? 'Nu am putut aduce vremea acum. Încearcă mai târziu.' : 'Pornește internetul ca să vezi vremea.'}</p>
        )}
      </section>
    );
  const daysFrom = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${realToday}T00:00:00Z`)) / 864e5;
  const dayName = (iso: string) => (iso === realToday ? 'Azi' : daysFrom(iso) === 1 ? 'Mâine' : new Date(`${iso}T12:00:00Z`).toLocaleDateString('ro-RO', { weekday: 'long', timeZone: 'UTC' }));
  const whole = (n: number | null) => (n === null ? '–' : Math.round(n));
  const rain = (d: WeatherDay) => (d.rainChancePct === null || d.rainMm === null ? '–' : `${Math.round(d.rainChancePct)}%, ${num(Math.round(d.rainMm * 10) / 10)} mm`);
  return (
    <section className="card s12">
      <div className="card-h">
        <h2>{title}</h2>
        <span>Următoarele {wx.forecast_days.value} zile</span>
      </div>
      {weatherAlerts(days, wx).map((a) => (
        <p className="wx-alert" key={a.kind}>
          {a.kind === 'frost' ? 'Risc de îngheț' : 'Vânt prea tare pentru stropit'}: {a.dates.map((d) => dayName(d).toLowerCase()).join(', ')}.
        </p>
      ))}
      <table className="wx-table">
        <thead>
          <tr>
            <th scope="col">Ziua</th>
            <th scope="col">Noapte / zi</th>
            <th scope="col">Ploaie</th>
            <th scope="col">Vânt</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{dayName(d.date)}</th>
              <td className={isFrost(d, wx) ? 'wx-frost' : undefined}>
                {whole(d.tempMinC)}° / {whole(d.tempMaxC)}°
              </td>
              <td>{rain(d)}</td>
              <td>{d.windMaxKmh === null ? '–' : `${Math.round(d.windMaxKmh)} km/h`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(failed || forecast!.stale) && <p className="note">Date din {date(forecast!.fetchedAt.slice(0, 10))}. Pornește internetul ca să vezi ce e nou.</p>}
      {seat && <p className="note">Prognoză pentru {seat}. La câmp poate fi altfel.</p>}
      <p className="note">
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          Date meteo: Open-Meteo.com
        </a>{' '}
        ·{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY 4.0
        </a>{' '}
        · Cifre rotunjite.
      </p>
    </section>
  );
}

export default function Acasa() {
  useMonitorRefresh();
  const view = useView('farm')!;
  const farm = useFarm()!;
  const monitor = useMonitor();
  const href = useHref();
  const lei = useLei();
  const today = view.today;
  const plan = view.farmPlan();
  const t = plan.timelines.medium;
  const crop = view.tabbedCrop;
  const when = (d: number) => (d === 0 ? 'Azi' : `În ${zile(d)}`);

  /* ---- What comes next: on a crop's tab, only that crop's work, sales and part of the APIA money ---- */
  const done = new Set(farm.doneTasks);
  const months = crop ? crop.months(view.harvestYearPlan().timelines.medium) : t.months;
  const ahead = months
    .flatMap((m) => m.entries.map((e) => view.planItem(e, m.key)))
    .map((i) => (crop && (i.kind === 'apia_advance' || i.kind === 'apia_balance') ? { ...i, title: `${i.title}, partea pentru ${crop.name.toLowerCase()}` } : i))
    .filter((i) => i.date && daysLeft(i.date, today) >= 0 && !(i.task && done.has(i.id)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const coming = ahead.slice(0, MAX_ROWS);
  const nextMoney = ahead.find((i) => i.direction === 'in') ?? null;
  const amount = (i: (typeof ahead)[number]) => (i.direction === 'none' ? when(daysLeft(i.date, today)) : `${i.direction === 'in' ? '+' : '−'}${lei(i.value)}`);

  /* ---- Calls still open: the ones followed first, then the soonest ---- */
  const callRows = useMemo(() => {
    const calls = new Map<string, { name: string; deadline: string | null; followed: boolean }>();
    const fits = pageFits(monitor.calls, view.farm, view.data(), today);
    for (const c of monitor.calls) {
      const followed = monitor.follows.has(c.key);
      const open = c.deadline ? c.deadline >= today : c.status === 'open';
      /* Calls for businesses only wait on the Oportunități page, in their own group: none of them is for farms. */
      const close = ['near', 'check'].includes(fits[c.key]?.level);
      if (!open || !(followed || close)) continue;
      const id = `${callName(c)}|${c.deadline}`;
      calls.set(id, { name: callName(c), deadline: c.deadline, followed: followed || !!calls.get(id)?.followed });
    }
    return [...calls.values()].sort((a, b) => Number(b.followed) - Number(a.followed) || (a.deadline || '9').localeCompare(b.deadline || '9'));
  }, [monitor, view, today]);

  const tiles: [string, IconName, string, string, string][] = [
    ['/recolte', 'plus', 'Notează o vânzare', 'Sau o cheltuială', ''],
    ['/salariu', 'shield', 'Salariul tău', 'Cum l-am calculat', 't-b'],
    ['/subventii', 'bank', 'Subvenția ta', `${lei(crop ? crop.share(plan.subsidies.totals.lei.probable) : plan.subsidies.totals.lei.probable)} de la APIA`, ''],
    ['/prognoza', 'chart', 'Prognoză', 'Îți ajung banii?', 't-c'],
  ];

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Bună, {view.farm.name}</h1>
          <p className="lead">{crop ? `Ce aduce și ce costă cultura de ${crop.name.toLowerCase()}, pe scurt.` : 'Banii fermei tale, pe scurt.'}</p>
        </div>
        <div className="acts">
          {!!farm.me && (
            <PageLink className="btn btn-line" path="/bani" href={href('/bani')}>
              Contul tău
            </PageLink>
          )}
          <PageLink className="btn btn-dark" path="/recolte" href={href('/recolte')}>
            Notează o vânzare
          </PageLink>
        </div>
      </header>
      <OfflineNote>Nu ai internet. Vezi ultimele date salvate pe acest telefon.</OfflineNote>
      <div className="bento">
        {crop ? (
          <CropSummary view={view} crop={crop} />
        ) : (
          <>
            <SalaryHero view={view} plan={plan} nextMoney={nextMoney} />
            <SideStats view={view} plan={plan} />
          </>
        )}
      </div>
      {crop && <p className="note gap">Subvenția e împărțită după hectare. Salariul, banii de acum și pensia sunt la Toată ferma.</p>}
      <div className="tiles gap">
        {tiles.map(([path, ic, title, sub, tone]) => (
          <PageLink key={path} className={tone} path={path} href={href(path)}>
            <span className="i">
              <Icon name={ic} />
            </span>
            <span className="go">
              <Icon name="arrow" />
            </span>
            <span className="t">
              <b>{title}</b>
              <small>{sub}</small>
            </span>
          </PageLink>
        ))}
      </div>
      {!crop && (
        <div className="bento gap">
          <CropBreakdown view={view} className="s12" />
        </div>
      )}
      <div className="bento gap">
        <section className="card s7">
          <div className="card-h">
            <h2>Ce urmează</h2>
          </div>
          <ol className="ac-list">
            {coming.length ? (
              coming.map((i, n) => (
                <li key={`${i.id}${n}`}>
                  <span>
                    <b>{i.title}</b>
                    <small>{date(i.date)}</small>
                  </span>
                  <span className={`ac-amt${i.direction === 'in' ? ' pos' : ''}`}>{amount(i)}</span>
                </li>
              ))
            ) : (
              <li className="ac-none">Nimic planificat.</li>
            )}
          </ol>
          <p className="note">
            <PageLink path="/calendar" href={href('/calendar')}>
              Vezi tot calendarul
            </PageLink>
          </p>
        </section>
        <section className="card s5 ac-calls">
          <div className="card-h">
            <h2>Oportunități</h2>
          </div>
          <ol className="ac-list">
            {callRows.length ? (
              callRows.slice(0, MAX_CALLS).map((r) => (
                <li key={`${r.name}${r.deadline}`}>
                  <span>
                    <b>{r.name}</b>
                    <small>{r.followed ? 'O urmărești' : 'Deschisă acum'}</small>
                  </span>
                  <span className="ac-amt">{r.deadline ? when(daysLeft(r.deadline, today)) : 'Fără termen'}</span>
                </li>
              ))
            ) : (
              <li className="ac-none">Nicio oportunitate deschisă acum.</li>
            )}
          </ol>
          <p className="note">
            <PageLink path="/oportunitati" href={href('/oportunitati')}>
              Vezi toate oportunitățile
            </PageLink>
          </p>
        </section>
        {!!farm.me && <Weather view={view} />}
      </div>
    </>
  );
}
