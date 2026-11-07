import { loadData, type SchemeResult, type SubsidyResult } from '@cropcash/shared';
import { t } from '../i18n';
import { formatDayMonth, formatLei } from '../lib/format';
import { failedConditionText } from '../lib/subsidyText';
import { VerifyBadge } from '../components/ui';

const data = loadData();
const event = (id: string) => data.calendar.events.find((e) => e.id === id);

/** Headline numbers are rounded to 100 lei: the farmer needs "about", not cents. */
const ROUND_LEI = 100;

const needsVerify = (s: SchemeResult) => s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;

/** Full screen, shown once right after onboarding. */
export function SubsidyResultScreen({ name, result, onNext }: { name?: string; result: SubsidyResult; onNext: () => void }) {
  return (
    <div className="solo">
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <SubsidyResultContent name={name} result={result} />
        <button type="button" className="primary" onClick={onNext}>
          {t('subsidy.next')}
        </button>
      </div>
    </div>
  );
}

/** The subsidy estimate itself: used after onboarding and in the "Subvenția" sheet. */
export function SubsidyResultContent({ name, result }: { name?: string; result: SubsidyResult }) {
  const { totals } = result;
  const advance = event('apia-avans');
  const balance = event('apia-sold');
  const base = result.schemes.find((s) => s.code === 'PD-01') ?? result.schemes[0];
  const dropPct = base ? Math.round((1 - base.factors.min) * 100) : null;
  const rate = result.rates.FEGA;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="bal">
        {name && <small>{t('subsidy.hello', { name })}</small>}
        <small>{t('subsidy.headline')}</small>
        <span className="amt">
          {formatLei(totals.lei.probable, ROUND_LEI)} {t('common.lei')}
        </span>
        <div className="row">
          <div>
            <b style={{ fontSize: 16 }}>
              {t('subsidy.range', {
                min: formatLei(totals.lei.min, ROUND_LEI),
                max: formatLei(totals.lei.max, ROUND_LEI),
              })}
            </b>
          </div>
          <span className="pill">{t('common.estimated')}</span>
        </div>
      </div>
      {dropPct !== null && dropPct > 0 && <p className="fine">{t('subsidy.rangeWhy', { pct: dropPct })}</p>}

      <div className="panel">
        <ul className="rows">
          {/* Amount under the title, not in a right column: stays readable on narrow phones. */}
          <li style={{ gridTemplateColumns: '42px minmax(0, 1fr)', alignItems: 'start' }}>
            <span className="badge" style={{ background: 'var(--t-mint)', color: 'var(--i-mint)' }}>
              75%
            </span>
            <div>
              <b>{t('subsidy.advanceTitle')}</b>
              <b className="in" style={{ fontSize: 20 }}>
                {formatLei(totals.advanceLei)} {t('common.lei')}
              </b>
              <small>
                {advance?.start && advance.end
                  ? t('subsidy.advanceWhen', { start: formatDayMonth(advance.start), end: formatDayMonth(advance.end) })
                  : ''}
                . {t('subsidy.advanceSure')}
              </small>
            </div>
          </li>
          <li style={{ gridTemplateColumns: '42px minmax(0, 1fr)', alignItems: 'start' }}>
            <span className="badge" style={{ background: 'var(--t-butter)', color: 'var(--i-butter)' }}>
              25%
            </span>
            <div>
              <b>{t('subsidy.balanceTitle')}</b>
              {/* Exact to the leu so that advance + balance visibly adds up. */}
              <b className="in" style={{ fontSize: 20 }}>
                {formatLei(totals.balanceLei.probable)} {t('common.lei')}
              </b>
              <small>
                {t('subsidy.balanceRange', {
                  min: formatLei(totals.balanceLei.min, ROUND_LEI),
                  max: formatLei(totals.balanceLei.max, ROUND_LEI),
                })}
                ,{' '}
                {balance?.start && balance.end
                  ? t('subsidy.balanceWhen', { start: formatDayMonth(balance.start), end: formatDayMonth(balance.end) })
                  : ''}
              </small>
            </div>
          </li>
        </ul>
      </div>

      <div className="panel">
        <div className="phead">
          <h2>{t('subsidy.schemesTitle')}</h2>
        </div>
        <ul className="rows">
          {result.schemes.map((s) => (
            <li key={s.code} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div>
                <b>
                  {s.nameRo}
                  {needsVerify(s) && <VerifyBadge />}
                </b>
              </div>
              <div className="num">
                {formatLei(s.leiIndicative.probable, ROUND_LEI)} {t('common.lei')}
              </div>
            </li>
          ))}
        </ul>

        {(result.notEligible.length > 0 || result.excluded.length > 0) && (
          <details style={{ marginTop: 10 }}>
            <summary className="link" style={{ display: 'block' }}>
              {t('subsidy.notEligibleTitle')}
            </summary>
            <ul className="rows">
              {result.notEligible.map((n) => (
                <li key={n.code} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                  <div>
                    <b>{n.nameRo}</b>
                    <small>{failedConditionText(n.failed[0]!)}</small>
                  </div>
                </li>
              ))}
              {result.excluded.map((x) => (
                <li key={x.code} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                  <div>
                    <b>{x.nameRo}</b>
                    <small>{t('subsidy.excludedNote')}</small>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <p className="fine">
        {t('subsidy.rateNote', { rate: rate.value.toLocaleString('ro-RO') })}
        {!rate.confirmed && <> {t('subsidy.rateDefault')}</>}
      </p>
    </div>
  );
}
