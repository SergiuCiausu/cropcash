import { loadData, type SchemeResult, type SubsidyResult } from '@cropcash/shared';
import { t } from '../i18n';
import { formatDayMonth, formatMoney } from '../lib/format';
import { failedConditionText } from '../lib/subsidyText';
import { Logo, VerifyBadge } from '../components/ui';
import { Icon } from '../components/Icon';

const data = loadData();
const event = (id: string) => data.calendar.events.find((e) => e.id === id);

/** Headline numbers are rounded to 100 lei: the farmer needs "about", not cents. */
const ROUND_LEI = 100;

const needsVerify = (s: SchemeResult) => s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;

/** Full screen, shown once right after onboarding. */
export function SubsidyResultScreen({ name, result, onNext }: { name?: string; result: SubsidyResult; onNext: () => void }) {
  return (
    <div className="solo">
      <div className="solo-top field">
        <Logo />
      </div>
      <div className="card">
        <SubsidyResultContent name={name} result={result} />
        <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 16 }} onClick={onNext}>
          {t('subsidy.next')} <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}

/** The subsidy estimate itself: after onboarding and in the "Subvenția" sheet. */
export function SubsidyResultContent({ name, result }: { name?: string; result: SubsidyResult }) {
  const { totals } = result;
  const advance = event('apia-avans');
  const balance = event('apia-sold');
  const base = result.schemes.find((s) => s.code === 'PD-01') ?? result.schemes[0];
  const dropPct = base ? Math.round((1 - base.factors.min) * 100) : null;
  const rate = result.rates.FEGA;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="cta field">
        <div>
          {name && <p className="eyebrow">{t('subsidy.hello', { name })}</p>}
          <p className="eyebrow">{t('subsidy.headline')}</p>
          <p className="n36">
            {formatMoney(totals.lei.probable, ROUND_LEI)} {t('common.currency')}
          </p>
          <p>
            {t('subsidy.range', {
              min: formatMoney(totals.lei.min, ROUND_LEI),
              max: formatMoney(totals.lei.max, ROUND_LEI),
            })}
          </p>
        </div>
      </section>
      {dropPct !== null && dropPct > 0 && <p className="note">{t('subsidy.rangeWhy', { pct: dropPct })}</p>}

      <ol>
        <li className="tx" style={{ alignItems: 'start' }}>
          <span className="ti">75%</span>
          <div className="tm">
            <b>{t('subsidy.advanceTitle')}</b>
            <b className="tab" style={{ fontSize: 20, color: 'var(--ink-a)' }}>
              {formatMoney(totals.advanceLei)} {t('common.currency')}
            </b>
            <small style={{ whiteSpace: 'normal' }}>
              {advance?.start && advance.end
                ? t('subsidy.advanceWhen', { start: formatDayMonth(advance.start), end: formatDayMonth(advance.end) })
                : ''}
              . {t('subsidy.advanceSure')}
            </small>
          </div>
          <span />
        </li>
        <li className="tx" style={{ alignItems: 'start' }}>
          <span className="ti b">25%</span>
          <div className="tm">
            <b>{t('subsidy.balanceTitle')}</b>
            {/* Exact to the leu so that advance + balance visibly adds up. */}
            <b className="tab" style={{ fontSize: 20, color: 'var(--ink-b)' }}>
              {formatMoney(totals.balanceLei.probable)} {t('common.currency')}
            </b>
            <small style={{ whiteSpace: 'normal' }}>
              {t('subsidy.balanceRange', {
                min: formatMoney(totals.balanceLei.min, ROUND_LEI),
                max: formatMoney(totals.balanceLei.max, ROUND_LEI),
              })}
              ,{' '}
              {balance?.start && balance.end
                ? t('subsidy.balanceWhen', { start: formatDayMonth(balance.start), end: formatDayMonth(balance.end) })
                : ''}
            </small>
          </div>
          <span />
        </li>
      </ol>

      <div>
        <div className="card-h">
          <h2 style={{ fontSize: 16 }}>{t('subsidy.schemesTitle')}</h2>
        </div>
        <ul className="rows">
          {result.schemes.map((s) => (
            <li key={s.code}>
              <b>
                {s.nameRo}
                {needsVerify(s) && <VerifyBadge />}
              </b>
              <b className="tab">
                {formatMoney(s.leiIndicative.probable, ROUND_LEI)} {t('common.currency')}
              </b>
            </li>
          ))}
        </ul>
        {(result.notEligible.length > 0 || result.excluded.length > 0) && (
          <details style={{ marginTop: 8 }}>
            <summary className="linkbtn" style={{ display: 'list-item', cursor: 'pointer' }}>
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

      <p className="note">
        {t('subsidy.rateNote', { rate: rate.value.toLocaleString('ro-RO') })}
        {!rate.confirmed && <> {t('subsidy.rateDefault')}</>}
      </p>
    </div>
  );
}
