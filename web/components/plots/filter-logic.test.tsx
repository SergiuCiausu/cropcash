// @vitest-environment happy-dom
/* The parcel filters' words, the „Filtre” form, and the address (docs/harta-plan.md, step 6). */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlotFilters } from '../../../packages/shared/src/plots/index';
import { EMPTY_FORM, formOf, readForm } from './filter-form';
import { countText, filterChips, showText, typedHa, typedLei, type FilterNames } from './filter-text';
import { addressWith, usePlotQuery } from './usePlotQuery';

const names: FilterNames = {
  cropName: (id) => ({ grau: 'Grâu', porumb: 'Porumb', floarea: 'Floarea-soarelui' })[id] ?? id,
  placeName: (s) => (s === 153277 ? 'Măldăeni' : String(s)),
  soonDays: 30,
};

describe('the chips', () => {
  it('say each filter in plain words, in a fixed order', () => {
    const f: PlotFilters = {
      cropChanged: true,
      crops: ['grau', 'porumb', 'floarea'],
      sizeAri: { min: 250 },
      result: { min: -150_000, max: 500_000, perHa: true },
      todo: 'soon',
      harvest: { from: '2027-07', to: '2027-08' },
      sown: { from: '2026-10', to: '2026-10' },
      siruta: [153277],
      treatmentsDone: ['herbicide', 'fungicide'],
      placement: ['approx', 'none'],
      landUse: ['PP'],
      text: '286',
    };
    expect(filterChips(f, names).map((c) => c.text)).toEqual([
      'Grâu și încă 2',
      'cel puțin 2,50 ha',
      'Rezultat între −1.500 și 5.000 lei/ha',
      'Făcut: erbicid, fungicid',
      'De făcut în 30 de zile',
      'Semănat în oct. 2026',
      'Recoltă iul. 2027 – aug. 2027',
      'Măldăeni',
      'Bloc sau parcelă: 286',
      'Loc aproximativ sau Fără loc pe hartă',
      'Pajiște permanentă',
      'Altă cultură decât anul trecut',
    ]);
  });

  it('count the parcels in Romanian', () => {
    expect(countText(7, 12)).toBe('7 din 12 parcele');
    expect(countText(3, 25)).toBe('3 din 25 de parcele');
    expect(countText(12, 12)).toBe('Toate cele 12 parcele');
    expect(countText(1, 1)).toBe('O parcelă');
    expect(countText(0, 1)).toBe('0 din 1 parcelă');
    expect([showText(null), showText(0), showText(1), showText(21)]).toEqual(['Arată parcelele', 'Nicio parcelă nu se potrivește', 'Arată o parcelă', 'Arată 21 de parcele']);
  });
});

describe('the „Filtre” form', () => {
  it('reads amounts the way a farmer types them, a loss with a minus', () => {
    expect(typedLei('1.500')).toBe(150_000);
    expect(typedLei('−2 000')).toBe(-200_000);
    expect(typedLei('-300')).toBe(-30_000);
    expect(typedLei('')).toBeNull();
    expect(typedLei('12,5')).toBeNull();
    expect(typedHa('2,5')).toBe(250);
    expect(typedHa('')).toBeNull();
  });

  it('goes back and forth with the filters', () => {
    const f: PlotFilters = { crops: ['grau'], sizeAri: { min: 250, max: 1000 }, expenses: { max: 300_000, perHa: true }, treatmentsDone: ['herbicide'], todo: 'overdue', cropChanged: false };
    expect(readForm(formOf(f))).toEqual({ ok: true, filters: f });
    expect(readForm(EMPTY_FORM)).toEqual({ ok: true, filters: {} });
  });

  it('turns a backwards range around, and points at what it cannot read', () => {
    const form = { ...EMPTY_FORM, sizeMin: '10', sizeMax: '2', harvestFrom: '2027-09', harvestTo: '2027-07' };
    expect(readForm(form)).toEqual({ ok: true, filters: { sizeAri: { min: 200, max: 1000 }, harvest: { from: '2027-07', to: '2027-09' } } });
    const bad = { ...EMPTY_FORM, sizeMax: 'zece', money: { ...EMPTY_FORM.money, revenue: { min: '1,5', max: '', perHa: false } } };
    expect(readForm(bad)).toEqual({ ok: false, bad: ['sizeMax', 'revenueMin'] });
  });

  it('„anume lucrări” with none ticked is no filter', () => {
    expect(readForm({ ...EMPTY_FORM, treatments: 'kinds' })).toEqual({ ok: true, filters: {} });
  });
});

describe('the address', () => {
  afterEach(() => {
    cleanup();
    history.replaceState(null, '', '/');
  });

  it('replaces only the parcel keys, keeps the rest, and reads commas plainly', () => {
    const view = { byCrop: true, sort: 'size' as const, dir: 'desc' as const };
    expect(addressWith('https://x.ro/harta?cultura=orz&utm=1#lista', { crops: ['grau', 'porumb'] }, view)).toBe(
      'https://x.ro/harta?utm=1&cultura=grau,porumb&vedere=culturi&ordine=suprafata-desc#lista',
    );
    expect(addressWith('https://x.ro/harta', {}, { byCrop: false, sort: 'name', dir: 'asc' })).toBeNull();
  });

  it('starts from the address, and writes back without adding history steps', async () => {
    history.replaceState(null, '', '/harta?cultura=grau&an=2026&x=1');
    const before = history.length;
    const { result } = renderHook(() => usePlotQuery());
    expect(result.current.ready).toBe(true);
    expect(result.current.filters).toEqual({ crops: ['grau'] });
    expect(result.current.view.year).toBe(2026);
    act(() => result.current.setFilters({ todo: 'overdue' }));
    expect(location.search).toBe('?x=1&de_facut=intarziate&an=2026');
    expect(history.length).toBe(before);
  });

  it('waits while a sheet owns the history entry, then writes after its Back', () => {
    history.replaceState(null, '', '/harta');
    const { result } = renderHook(() => usePlotQuery());
    history.pushState({ ccSheet: 1 }, '');
    act(() => result.current.setFilters({ crops: ['porumb'] }));
    expect(location.search).toBe('');
    // The sheet closes: its entry goes and the browser fires popstate on the page's own entry.
    history.replaceState(null, '', '/harta');
    act(() => {
      dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(location.search).toBe('?cultura=porumb');
  });
});
