// @vitest-environment happy-dom
/* The filter bar and the „Filtre” sheet (docs/harta-plan.md, step 6), on rows built the way the page builds them. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { expense, op, plot, sale, season } from '../../../packages/shared/src/plots/fixtures';
import { buildPlotRows, DEFAULT_VIEW, type PlotFilters as Filters, type PlotView } from '../../../packages/shared/src/plots/index';
import type { FilterNames } from './filter-text';
import { PlotFilters } from './PlotFilters';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const TODAY = '2026-11-15';
const rows = buildPlotRows({
  year: 2027,
  today: TODAY,
  plots: [plot('a', { name: 'La pădure' }), plot('b', { siruta: 152868, geometry_source: 'approx' }), plot('c', { land_use: 'PP' }), plot('d')],
  seasons: [season('a', 'grau', 600), season('b', 'grau', 200), season('c', 'porumb', 200), season('d', 'porumb', 1000), season('a', 'porumb', 600, { harvest_year: 2026 })],
  operations: [op('1', 'a'), op('2', 'b', { status: 'planned', on_date: '2026-12-01', kind: 'fungicide' })],
  transactions: [expense(60_000, { plot_id: 'a' }), sale(200_000, { crop_id: 'grau' })],
  crops: loadData().crops.crops,
});
const names: FilterNames = {
  cropName: (id) => ({ grau: 'Grâu', porumb: 'Porumb' })[id] ?? id,
  placeName: (s) => ({ 153277: 'Măldăeni', 152868: 'Drăgănești-Vlașca' })[s] ?? String(s),
  soonDays: 30,
};

function show(start: Filters = {}, years = [2026, 2027]) {
  const seen = { filters: start, view: DEFAULT_VIEW as PlotView };
  function Page() {
    const [filters, setFilters] = useState(start);
    const [view, setView] = useState<PlotView>(DEFAULT_VIEW);
    seen.filters = filters;
    seen.view = view;
    return <PlotFilters rows={rows} filters={filters} view={view} onFilters={setFilters} onView={setView} names={names} today={TODAY} years={years} year={2027} />;
  }
  render(<Page />);
  return seen;
}
const sheet = () => within(screen.getByRole('dialog', { name: 'Filtre' }));

describe('the filter bar', () => {
  it('counts what shows, one chip per filter; × takes one away, „Șterge filtrele” all', () => {
    const seen = show({ crops: ['grau'], placement: ['approx'] });
    expect(screen.getByText('1 din 4 parcele')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Scoate filtrul: Loc aproximativ' }));
    expect(seen.filters).toEqual({ crops: ['grau'] });
    expect(screen.getByText('2 din 4 parcele')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Șterge filtrele' }));
    expect(seen.filters).toEqual({});
    expect(screen.getByText('Toate cele 4 parcele')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Șterge filtrele' })).toBeNull();
  });

  it('switches to „Pe culturi”, changes the order and the campaign', () => {
    const seen = show();
    fireEvent.click(screen.getByRole('button', { name: 'Pe culturi' }));
    expect(seen.view.byCrop).toBe(true);
    fireEvent.change(screen.getByLabelText('Ordine'), { target: { value: 'size-desc' } });
    expect(seen.view).toMatchObject({ sort: 'size', dir: 'desc' });
    fireEvent.change(screen.getByLabelText('Recolta'), { target: { value: '2026' } });
    expect(seen.view.year).toBe(2026);
    fireEvent.change(screen.getByLabelText('Recolta'), { target: { value: '2027' } });
    expect(seen.view.year).toBeUndefined();
  });

  it('hides the campaign picker when there is only one', () => {
    show({}, [2027]);
    expect(screen.queryByLabelText('Recolta')).toBeNull();
  });
});

describe('the „Filtre” sheet', () => {
  it('offers only what the farm has, shows the count as you choose, and applies', () => {
    const seen = show();
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    const s = sheet();
    // One land-use code would be no choice; two localities are.
    expect(s.getByRole('group', { name: 'Folosința terenului' })).toBeTruthy();
    expect(s.getByRole('group', { name: 'Localitatea' })).toBeTruthy();
    expect(s.getByRole('button', { name: 'Arată 4 parcele' })).toBeTruthy();
    fireEvent.click(s.getByLabelText('Porumb'));
    expect(s.getByRole('button', { name: 'Arată 2 parcele' })).toBeTruthy();
    const size = within(s.getByRole('group', { name: 'Suprafața, în hectare' }));
    fireEvent.change(size.getByLabelText('de la'), { target: { value: '5' } });
    expect(s.getByRole('button', { name: 'Arată o parcelă' })).toBeTruthy();
    fireEvent.click(s.getByRole('button', { name: 'Arată o parcelă' }));
    expect(seen.filters).toEqual({ crops: ['porumb'], sizeAri: { min: 500 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filtre (2)' })).toBeTruthy();
  });

  it('refuses an amount it cannot read, and says so', () => {
    const seen = show();
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    const money = within(sheet().getByRole('group', { name: 'Cheltuieli' }));
    fireEvent.change(money.getByLabelText('de la'), { target: { value: 'multe' } });
    expect(sheet().getByRole('alert').textContent).toMatch(/Scrie doar cifre/);
    expect((sheet().getByRole('button', { name: 'Arată parcelele' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(money.getByLabelText('de la'), { target: { value: '50' } });
    fireEvent.click(money.getByRole('button', { name: 'Pe hectar' }));
    fireEvent.click(sheet().getByRole('button', { name: /^Arată/ }));
    expect(seen.filters).toEqual({ expenses: { min: 5_000, perHa: true } });
  });

  it('opens on the filters in use, and „Renunță” leaves them as they were', () => {
    const seen = show({ todo: 'soon', cropChanged: true });
    fireEvent.click(screen.getByRole('button', { name: 'Filtre (2)' }));
    expect((sheet().getByLabelText('În următoarele 30 de zile') as HTMLInputElement).checked).toBe(true);
    expect((sheet().getByLabelText('Altă cultură') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sheet().getByRole('button', { name: 'Șterge tot' }));
    expect((sheet().getByLabelText('Altă cultură') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sheet().getByRole('button', { name: 'Renunță' }));
    expect(seen.filters).toEqual({ todo: 'soon', cropChanged: true });
  });

  it('„Nicio parcelă” when the choices leave nothing', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }));
    fireEvent.change(within(sheet().getByRole('group', { name: 'Suprafața, în hectare' })).getByLabelText('de la'), { target: { value: '50' } });
    expect((sheet().getByRole('button', { name: 'Nicio parcelă nu se potrivește' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

