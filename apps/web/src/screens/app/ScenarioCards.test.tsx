import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { birthYearFromAge, computeFarmPlan, loadData } from '@cropcash/shared';
import { QuarterTable, SaleCard, ScenarioSalaryCard } from './ScenarioCards';

// Ion on 1 November 2026, no Stripe money yet (docs/09).
const plan = computeFarmPlan(
  {
    birth_year: birthYearFromAge(55, 2026),
    county: 'TR',
    start_balance_bani: 3_500_000,
    parcels: [
      { crop_id: 'grau', area_ari: 800, is_arable: true },
      { crop_id: 'porumb', area_ari: 700, is_arable: true },
    ],
    demo_now: '2026-11-01T10:00:00Z',
  },
  loadData(),
);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('ScenarioSalaryCard (Î1)', () => {
  it('the toggle changes the salary; no bad-year fund anywhere', () => {
    const good = text(renderToStaticMarkup(<ScenarioSalaryCard plan={plan} scenario="good" />));
    const bad = text(renderToStaticMarkup(<ScenarioSalaryCard plan={plan} scenario="bad" />));
    expect(good).toContain(`${(plan.salaries.good.salary / 100).toLocaleString('ro-RO')}`);
    expect(good).toContain('mai mult decât într-un an normal');
    expect(bad).toContain('an de secetă');
    expect(bad).not.toContain('fondul');
  });
});

describe('QuarterTable', () => {
  it('9 quarters from Nov 2026 to Dec 2028, first one partial', () => {
    const html = text(renderToStaticMarkup(<QuarterTable plan={plan} scenario="medium" />));
    expect(html).toContain('Trim. 4 2026 (din noiembrie)');
    expect(html).toContain('Trim. 4 2028');
    expect(html).toContain('În 2028 rămân');
  });
});

describe('SaleCard (Î4)', () => {
  it('starts on wheat at mean values: 0,85 lei/kg break-even', () => {
    const html = text(renderToStaticMarkup(<SaleCard plan={plan} />));
    expect(html).toContain('1,05 lei/kg');
    expect(html).toContain('42.000 lei');
    expect(html).toContain('0,85 lei/kg');
    expect(html).toContain('Câștig');
  });
});
