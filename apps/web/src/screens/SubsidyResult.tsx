import { loadData, type SchemeResult, type SubsidyResult } from '@cropcash/shared';
import { t } from '../i18n';
import { formatDayMonth, formatLei } from '../lib/format';
import { failedConditionText } from '../lib/subsidyText';
import { PrimaryButton, Screen, VerifyBadge } from '../components/ui';

const data = loadData();
const event = (id: string) => data.calendar.events.find((e) => e.id === id);

/** Headline numbers are rounded to 100 lei: the farmer needs "about", not cents. */
const ROUND_LEI = 100;

function needsVerify(s: SchemeResult): boolean {
  return s.schemeStatus === 'DE-VERIFICAT' || s.unverified.length > 0;
}

export function SubsidyResultScreen({
  name,
  result,
  onNext,
}: {
  name?: string;
  result: SubsidyResult;
  onNext?: () => void;
}) {
  const { totals } = result;
  const advance = event('apia-avans');
  const balance = event('apia-sold');
  const base = result.schemes.find((s) => s.code === 'PD-01') ?? result.schemes[0];
  const dropPct = base ? Math.round((1 - base.factors.min) * 100) : null;
  const rate = result.rates.FEGA;

  return (
    <Screen footer={onNext && <PrimaryButton onClick={onNext}>{t('subsidy.next')}</PrimaryButton>}>
      {name && <p className="text-xl">{t('subsidy.hello', { name })}</p>}

      <section aria-labelledby="headline">
        <h1 id="headline" className="text-2xl">
          {t('subsidy.headline')}
        </h1>
        <p className="mt-1 text-6xl font-bold tracking-tight text-field-700">
          {formatLei(totals.lei.probable, ROUND_LEI)} <span className="text-3xl">{t('subsidy.lei')}</span>
        </p>
        <p className="mt-2 text-xl">
          {t('subsidy.range', {
            min: formatLei(totals.lei.min, ROUND_LEI),
            max: formatLei(totals.lei.max, ROUND_LEI),
          })}
        </p>
        {dropPct !== null && dropPct > 0 && (
          <p className="mt-2 text-base text-field-900/70">{t('subsidy.rangeWhy', { pct: dropPct })}</p>
        )}
      </section>

      <section className="grid gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg text-field-900/70">{t('subsidy.advanceTitle')}</h2>
          <p className="text-3xl font-bold">
            {formatLei(totals.advanceLei)} {t('subsidy.lei')}
          </p>
          {advance?.start && advance.end && (
            <p className="text-lg">
              {t('subsidy.advanceWhen', { start: formatDayMonth(advance.start), end: formatDayMonth(advance.end) })}
            </p>
          )}
          <p className="text-base text-field-900/70">{t('subsidy.advanceSure')}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg text-field-900/70">{t('subsidy.balanceTitle')}</h2>
          <p className="text-3xl font-bold">
            {/* Exact to the leu so that advance + balance visibly adds up. */}
            {formatLei(totals.balanceLei.probable)} {t('subsidy.lei')}
          </p>
          <p className="text-lg">
            {t('subsidy.balanceRange', {
              min: formatLei(totals.balanceLei.min, ROUND_LEI),
              max: formatLei(totals.balanceLei.max, ROUND_LEI),
            })}
          </p>
          {balance?.start && balance.end && (
            <p className="text-base text-field-900/70">
              {t('subsidy.balanceWhen', { start: formatDayMonth(balance.start), end: formatDayMonth(balance.end) })}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-semibold">{t('subsidy.schemesTitle')}</h2>
        <ul className="flex flex-col gap-2">
          {result.schemes.map((s) => (
            <li key={s.code} className="flex items-baseline justify-between gap-3 rounded-xl bg-white px-4 py-3">
              <span className="text-lg">
                ✓ {s.nameRo}
                {needsVerify(s) && <VerifyBadge />}
              </span>
              <span className="shrink-0 text-lg font-semibold">
                {formatLei(s.leiIndicative.probable, ROUND_LEI)} {t('subsidy.lei')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(result.notEligible.length > 0 || result.excluded.length > 0) && (
        <details className="rounded-xl bg-white px-4 py-3">
          <summary className="cursor-pointer py-1 text-lg font-semibold">{t('subsidy.notEligibleTitle')}</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {result.notEligible.map((n) => (
              <li key={n.code}>
                <p className="text-lg">{n.nameRo}</p>
                <p className="text-base text-field-900/70">{failedConditionText(n.failed[0]!)}</p>
              </li>
            ))}
            {result.excluded.map((x) => (
              <li key={x.code}>
                <p className="text-lg">{x.nameRo}</p>
                <p className="text-base text-field-900/70">{t('subsidy.excludedNote')}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-base text-field-900/70">
        {t('subsidy.rateNote', { rate: rate.value.toLocaleString('ro-RO') })}
        {!rate.confirmed && <> {t('subsidy.rateDefault')}</>}
      </p>
    </Screen>
  );
}
