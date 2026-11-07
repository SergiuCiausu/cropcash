/*
 * Step 8: scenarios (Î1), the 3-year quarterly projection and the harvest sale (Î4).
 * All computed on the phone from packages/shared, so they work offline.
 */
import { useState } from 'react';
import { loadData, saleForecast, saleRanges, type AmountScenario } from '@cropcash/shared';
import { t } from '../../i18n';
import { cropName, type FarmPlan } from '../../lib/plan';
import { formatHa, formatLei, formatMonth } from '../../lib/format';

const data = loadData();
const leiKg = (bani: number) => (bani / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2 });

/** Î1: the safe salary in the chosen kind of year; in a drought, why the fund exists. */
export function ScenarioSalaryCard({ plan, scenario, className = '' }: { plan: FarmPlan; scenario: AmountScenario; className?: string }) {
  const kind = t(`scenario.kinds.${scenario}`);
  const salary = plan.salaries[scenario].salary;
  const diff = salary - plan.salaries.medium.salary;
  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('scenario.salaryTitle')}</h2>
      </div>
      <p className="n28">
        {formatLei(salary)} {t('salary.perMonth')}
      </p>
      <p className="muted">
        {salary > 0 ? t('scenario.salaryLine', { kind, amount: formatLei(salary) }) : t('scenario.salaryZero', { kind })}
      </p>
      {diff !== 0 && (
        <p style={{ marginTop: 6, fontWeight: 600 }}>
          {diff < 0
            ? t('scenario.lessThanNormal', { amount: formatLei(-diff) })
            : t('scenario.moreThanNormal', { amount: formatLei(diff) })}
        </p>
      )}
      {scenario === 'bad' && (
        <p style={{ marginTop: 6 }}>
          {plan.riskFund.done
            ? t('scenario.fundDone', { target: formatLei(plan.riskTarget) })
            : t('scenario.fund', { saved: formatLei(plan.riskFund.saved), target: formatLei(plan.riskTarget) })}
        </p>
      )}
      <p className="note" style={{ marginTop: 8 }}>
        {t('scenario.paidNote')}
      </p>
    </section>
  );
}

/** Quarter by quarter, this year + 2, for the chosen kind of year. */
export function QuarterTable({ plan, scenario }: { plan: FarmPlan; scenario: AmountScenario }) {
  const { quarters, years } = plan.projection[scenario];
  const first = plan.month;
  return (
    <div>
      <p className="muted" style={{ marginBottom: 8 }}>
        {t('projection.sub', { kind: t(`scenario.kinds.${scenario}`) })}
      </p>
      <div className="mrow head">
        <span>{t('projection.colQuarter')}</span>
        <span>{t('forecast.colIn')}</span>
        <span>{t('forecast.colOut')}</span>
        <span>{t('forecast.colLeft')}</span>
      </div>
      {quarters.map((q, i) => (
        <div className="mrow" key={q.key}>
          <span>
            {t('projection.quarter', { q: q.quarter, year: q.year })}
            {i === 0 && q.months < 3 && t('projection.partial', { month: formatMonth(first) })}
          </span>
          <span data-l={t('forecast.colIn')}>{formatLei(q.in)}</span>
          <span data-l={t('forecast.colOut')}>{formatLei(q.out)}</span>
          <span className={`v${q.balanceEnd < 0 ? ' neg' : ''}`}>
            {formatLei(q.balanceEnd)} {t('common.lei')}
          </span>
        </div>
      ))}
      <ul style={{ marginTop: 12 }}>
        {years.map((y) => (
          <li key={y.year} className="note" style={{ marginTop: 4 }}>
            {y.net >= 0
              ? t('projection.yearLeft', { year: y.year, amount: formatLei(y.net, 100) })
              : t('projection.yearShort', { year: y.year, amount: formatLei(-y.net, 100) })}
          </li>
        ))}
      </ul>
      <p className="note" style={{ marginTop: 8 }}>
        {t('projection.note')}
      </p>
    </div>
  );
}

/** Î4: price and yield sliders for one crop, with the break-even price. */
export function SaleCard({ plan, className = '' }: { plan: FarmPlan; className?: string }) {
  const crops = plan.economics;
  const [cropId, setCropId] = useState(crops[0]?.cropId ?? '');
  const crop = data.crops.crops.find((c) => c.id === cropId);
  const area = crops.find((e) => e.cropId === cropId)?.areaAri ?? 0;
  const ranges = crop ? saleRanges(crop) : null;
  const [price, setPrice] = useState<Record<string, number>>({});
  const [yieldKg, setYieldKg] = useState<Record<string, number>>({});
  if (!crop || !ranges) return null;

  const p = price[cropId] ?? ranges.price.mean;
  const y = yieldKg[cropId] ?? ranges.yield.mean;
  const f = saleForecast(crop, area, { priceBaniPerKg: p, yieldKgPerHa: y });
  const slider = { width: '100%', minHeight: 44, accentColor: 'var(--ink-b)' } as const;

  return (
    <section className={`card ${className}`}>
      <div className="card-h">
        <h2>{t('sale.title')}</h2>
      </div>
      <p className="muted">{t('sale.lead')}</p>
      {crops.length > 1 && (
        <div role="group" aria-label={t('sale.crop')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {crops.map((e) => (
            <button
              key={e.cropId}
              type="button"
              className={`btn ${e.cropId === cropId ? 'btn-dark' : 'btn-line'}`}
              aria-pressed={e.cropId === cropId}
              onClick={() => setCropId(e.cropId)}
            >
              {cropName(e.cropId)} · {formatHa(e.areaAri / 100)} ha
            </button>
          ))}
        </div>
      )}
      <label className="field-l" style={{ marginTop: 12 }}>
        {t('sale.price')}: <b>{t('sale.priceValue', { amount: leiKg(p) })}</b>
        <input
          type="range"
          min={ranges.price.min}
          max={ranges.price.max}
          step={1}
          value={p}
          onChange={(e) => setPrice({ ...price, [cropId]: Number(e.target.value) })}
          style={slider}
        />
      </label>
      <label className="field-l" style={{ marginTop: 8 }}>
        {t('sale.yield')}: <b>{t('sale.yieldValue', { t: formatHa(y / 1000) })}</b>
        <input
          type="range"
          min={ranges.yield.min}
          max={ranges.yield.max}
          step={100}
          value={y}
          onChange={(e) => setYieldKg({ ...yieldKg, [cropId]: Number(e.target.value) })}
          style={slider}
        />
      </label>
      <div className="crop-l" style={{ marginTop: 12 }}>
        <span>{t('sale.income')}</span>
        <span>
          {formatLei(f.income)} {t('common.lei')}
        </span>
      </div>
      <div className="crop-l">
        <span>{t('sale.cost')}</span>
        <span>
          {formatLei(f.cost)} {t('common.lei')}
        </span>
      </div>
      <div className="crop-l" style={{ fontWeight: 600 }}>
        <span>{f.margin >= 0 ? t('sale.gain') : t('sale.loss')}</span>
        <span style={f.margin < 0 ? { color: 'var(--bad)' } : undefined}>
          {formatLei(Math.abs(f.margin))} {t('common.lei')}
        </span>
      </div>
      <p style={{ marginTop: 10, fontWeight: 600 }}>
        {f.productionKg > 0 ? t('sale.breakEven', { amount: leiKg(f.breakEvenPerKg) }) : t('sale.noHarvest')}
      </p>
      <p className="note" style={{ marginTop: 6 }}>
        {t('sale.note')}
      </p>
    </section>
  );
}
