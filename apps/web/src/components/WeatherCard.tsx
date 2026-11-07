/* 7-day forecast for the farmer's county. Offline it shows the last saved copy. */
import type { CSSProperties } from 'react';
import { isFrost, loadData, upcomingWeather, weatherAlerts, type WeatherDay } from '@cropcash/shared';
import { t } from '../i18n';
import { formatDayMonth, formatOneDecimal, formatWeekday, nextDayIso, todayIso } from '../lib/format';
import { countyName } from '../lib/plan';
import { useWeather } from '../lib/weather';

const data = loadData();
const params = data.params.weather;

function dayName(date: string, today: string) {
  if (date === today) return t('weather.today');
  if (date === nextDayIso(today)) return t('weather.tomorrow');
  return formatWeekday(date);
}

const whole = (n: number | null) => (n === null ? t('weather.none') : Math.round(n));

function rainText(d: WeatherDay) {
  if (d.rainChancePct === null || d.rainMm === null) return t('weather.none');
  return t('weather.rain', { chance: Math.round(d.rainChancePct), mm: formatOneDecimal(d.rainMm) });
}

function DayRow({ d, today }: { d: WeatherDay; today: string }) {
  return (
    <tr>
      <th scope="row">{dayName(d.date, today)}</th>
      <td className={isFrost(d, params) ? 'wx-frost' : undefined}>
        {t('weather.temp', { min: whole(d.tempMinC), max: whole(d.tempMaxC) })}
      </td>
      <td>{rainText(d)}</td>
      <td>{d.windMaxKmh === null ? t('weather.none') : t('weather.wind', { speed: Math.round(d.windMaxKmh) })}</td>
    </tr>
  );
}

function Credit() {
  return (
    <p className="note wx-credit">
      <a href={t('weather.creditUrl')} target="_blank" rel="noopener noreferrer">
        {t('weather.creditText')}
      </a>
      {' · '}
      <a href={t('weather.licenceUrl')} target="_blank" rel="noopener noreferrer">
        {t('weather.licenceText')}
      </a>
      {' · '}
      {t('weather.changed')}
    </p>
  );
}

export function WeatherCard({ countyCode, style }: { countyCode: string; style?: CSSProperties }) {
  const { forecast, loading, failed } = useWeather(countyCode);
  const today = todayIso();
  const days = forecast ? upcomingWeather(forecast.days, today) : [];
  const seat = data.counties.counties.find((c) => c.code === countyCode)?.seat_ro;
  const old = forecast !== null && (failed || forecast.stale);

  let empty = '';
  if (days.length === 0) {
    if (loading) empty = t('weather.loading');
    else empty = navigator.onLine ? t('weather.unavailable') : t('weather.offline');
  }

  return (
    <section className="card weather" style={style}>
      <div className="card-h">
        <h2>{t('weather.title', { county: countyName(countyCode) })}</h2>
        <span>{t('weather.next', { days: params.forecast_days.value })}</span>
      </div>

      {empty && <p className="note">{empty}</p>}

      {days.length > 0 && (
        <>
          {weatherAlerts(days, params).map((a) => (
            <p className="wx-alert" key={a.kind}>
              {t(a.kind === 'frost' ? 'weather.frost' : 'weather.windAlert', {
                days: a.dates.map((date) => dayName(date, today).toLowerCase()).join(', '),
              })}
            </p>
          ))}
          <table className="wx-table">
            <thead>
              <tr>
                <th scope="col">{t('weather.colDay')}</th>
                <th scope="col">{t('weather.colTemp')}</th>
                <th scope="col">{t('weather.colRain')}</th>
                <th scope="col">{t('weather.colWind')}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <DayRow d={d} today={today} key={d.date} />
              ))}
            </tbody>
          </table>
          {old && <p className="note">{t('weather.old', { date: formatDayMonth(forecast.fetchedAt.slice(0, 10)) })}</p>}
          {seat && <p className="note">{t('weather.place', { seat })}</p>}
          <Credit />
        </>
      )}
    </section>
  );
}
