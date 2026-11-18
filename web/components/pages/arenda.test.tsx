// @vitest-environment happy-dom
/* Arendă (docs/employees-arenda-plan.md §3, plan step 7): the landowners and their contracts, the year's rent, what
   needs doing, a parcel's tenure, and „De la câți proprietari?” at onboarding. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showOnboarding, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  /* Onboarding keeps its step in the history state and its typing in a draft: each test starts fresh. */
  history.replaceState(null, '');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MARIA = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const VASILE = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
const PLOT = '9e8d7c6b-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const owner = (over: object = {}) => ({ id: MARIA, name: 'Maria Popescu', locality: 'Peretu', phone: null, payment: 'in_kind', note: null, archived_at: null, ...over });
const contract = (over: object = {}) => ({
  id: 'c1',
  landowner_id: MARIA,
  direction: 'taken',
  area_ari: 250,
  locality: 'Peretu',
  plot_ids: [],
  starts_on: '2022-10-01',
  ends_on: '2030-09-30',
  rent_bani_per_ha: null,
  rent_kg_per_ha: 800,
  rent_crop_id: 'grau',
  pay_month: 9,
  land_tax_by: null,
  registration_no: '12/2022',
  registration_date: '2022-10-10',
  archived_at: null,
  ...over,
});

function farmWith(over: object = {}) {
  const me = { ...ME, farm_mode: 'arendas', leased_in_ari: 500, landowner_count: 40, landowners: [owner()], lease_contracts: [contract()], ...over };
  return { me, saved: { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) } };
}
const main = () => document.querySelector('main')!;
const text = () => main().textContent!;
const writes = (live: { write: unknown }) => (live.write as ReturnType<typeof vi.fn>).mock.calls;
const dialog = (name: string) => within(screen.getByRole('dialog', { name, hidden: true }));
const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!);
  });
  await act(async () => undefined);
  await act(async () => undefined);
};

describe('Arendă', () => {
  it('shows the land, the landowners by village, and the year’s rent at the county price', async () => {
    const { me, saved } = farmWith();
    await showPage('arenda', 'farm', saved, true, me);
    expect(text()).toContain('2,50 ha');
    expect(text()).toContain('1 din 40');
    expect(text()).toContain('Ai spus că iei 5 ha în arendă. În contracte sunt 2,50 ha: mai ai de trecut 2,50 ha.');
    // 2,5 ha × 800 kg = 2.000 kg wheat; Teleorman 0,69 lei/kg → 1.380 lei; tax 8% → 110 lei.
    const rent = screen.getByRole('heading', { name: 'Arenda pe an' }).closest('section')!;
    expect(rent.textContent).toContain('2.000 kg grâu comun de toamnă');
    expect(rent.textContent).toContain('cam 1.380 lei');
    expect(rent.textContent).toContain('în jur de 110 lei');
    const list = screen.getByRole('heading', { name: 'Proprietarii' }).closest('section')!;
    expect(within(list).getByRole('heading', { name: 'Peretu' })).toBeTruthy();
    expect(within(list).getByRole('button', { name: /Maria Popescu/ }).textContent).toContain('800 kg grâu comun de toamnă pe ha');
  });

  it('lists what to do: a renewal to refuse in time, a contract not registered', async () => {
    const { me, saved } = farmWith({ lease_contracts: [contract({ ends_on: '2027-11-30', registration_no: null })] });
    await showPage('arenda', 'farm', saved, true, me);
    const todo = screen.getByRole('heading', { name: 'De făcut' }).closest('section')!;
    expect(todo.textContent).toContain('Contractul cu Maria Popescu se termină pe 30 nov. 2027. Dacă nu vrei să-l reînnoiești, spune-i în scris până pe 30 nov. 2026.');
    expect(todo.textContent).toContain('Un contract nu are numărul de la primărie');
  });

  it('says when the county’s price for the crop isn’t known', async () => {
    const { me, saved } = farmWith({ county: 'GR' });
    await showPage('arenda', 'farm', saved, true, me);
    expect(text()).toMatch(/pentru grâu comun de toamnă nu sunt în aplicație/);
    expect(text()).not.toContain('cam 1.380 lei');
  });

  it('adds a landowner, then a contract with them, as the API takes it', async () => {
    const { me, saved } = farmWith({ landowners: [], lease_contracts: [] });
    const { live } = await showPage('arenda', 'farm', saved, true, me);
    (live.write as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: VASILE });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă un proprietar' }));
    let sheet = dialog('Adaugă un proprietar');
    fireEvent.change(sheet.getByLabelText('Numele'), { target: { value: 'Vasile Ene' } });
    fireEvent.change(sheet.getByLabelText('Satul'), { target: { value: 'Vităneşti' } });
    fireEvent.click(sheet.getByRole('button', { name: 'În bani', hidden: true }));
    fireEvent.click(sheet.getByRole('button', { name: 'Adaugă', hidden: true }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    expect(writes(live)[0]![0]).toBe('add_landowner');
    expect(writes(live)[0]![1]).toMatchObject({ name: 'Vasile Ene', locality: 'Vităneşti', payment: 'cash' });

    await vi.waitFor(() => screen.getByRole('button', { name: 'Adaugă un contract', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă un contract', hidden: true }));
    sheet = dialog('Contractul');
    fireEvent.change(sheet.getByLabelText('Hectare'), { target: { value: '3,5' } });
    fireEvent.change(sheet.getByLabelText(/Arenda în bani/), { target: { value: '1200' } });
    fireEvent.change(sheet.getByLabelText(/Până pe/), { target: { value: '2031-09-30' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Adaugă contractul', hidden: true }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(2));
    const [name, input] = writes(live)[1]!;
    expect(name).toBe('add_lease_contract');
    expect(input).toMatchObject({ landownerId: VASILE, direction: 'taken', areaHa: 3.5, locality: 'Vităneşti', rentLeiPerHa: 1200, startsOn: '2026-11-15', endsOn: '2031-09-30', plotIds: [] });
    expect(input).not.toHaveProperty('rentKgPerHa');
  });

  it('asks for the rent before saving a contract', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('arenda', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: /Maria Popescu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă un contract', hidden: true }));
    const sheet = dialog('Contractul');
    fireEvent.change(sheet.getByLabelText('Hectare'), { target: { value: '1' } });
    fireEvent.change(sheet.getByLabelText(/Arenda în produse/), { target: { value: '' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Adaugă contractul', hidden: true }));
    expect(sheet.getByRole('alert', { hidden: true }).textContent).toContain('Scrie arenda');
    expect(live.write).not.toHaveBeenCalled();
  });

  it('sets whose land a parcel is, with internet', async () => {
    const { me, saved } = farmWith();
    const plots = { plots: [{ id: PLOT, name: 'La Vale', archived_at: null, auto_crop_id: null, tenure: 'own' }, { id: 'auto', name: null, archived_at: null, auto_crop_id: 'grau' }], seasons: [], operations: [] };
    const { live } = await showPage('arenda', 'farm', saved, true, me, { '/api/plots': plots });
    await vi.waitFor(() => screen.getByRole('heading', { name: 'Parcelele: al cui e pământul' }));
    const row = within(screen.getByRole('group', { name: 'Al cui e pământul: La Vale' }));
    fireEvent.click(row.getByRole('button', { name: 'Luat în arendă' }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    expect(writes(live)[0]!.slice(0, 2)).toEqual(['set_plot_tenure', { plotId: PLOT, tenure: 'leased_in' }]);
    await vi.waitFor(() => expect(text()).toContain('Parcela La Vale e trecută în arendă, dar nu e în niciun contract.'));
  });

  it('without internet: shows everything, adds nothing', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('arenda', 'farm', saved, false, me);
    expect((screen.getByRole('button', { name: 'Adaugă un proprietar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('Maria Popescu');
    expect(live.api).not.toHaveBeenCalledWith('/api/plots');
  });

  it('shows a landowner’s rent for the year: what they’re owed, the tax withheld, what they get', async () => {
    const { me, saved } = farmWith();
    await showPage('arenda', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: /Maria Popescu/ }));
    const owed = within(dialog('Proprietarul').getByRole('group', { name: 'Arenda lui în 2026', hidden: true }));
    expect(owed.getByText('2.000 kg grâu comun de toamnă')).toBeTruthy();
    expect(owed.getByText('110,40 lei')).toBeTruthy();
    expect(owed.getByText('1.840 kg grâu comun de toamnă')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lista pentru contabil, 2026' })).toBeTruthy();
  });

  it('says when money rent has no pay month, so it isn’t in the plan', async () => {
    const { me, saved } = farmWith({ lease_contracts: [contract({ rent_kg_per_ha: null, rent_crop_id: null, rent_bani_per_ha: 100_000, pay_month: null })] });
    await showPage('arenda', 'farm', saved, true, me);
    const todo = screen.getByRole('heading', { name: 'De făcut' }).closest('section')!;
    expect(todo.textContent).toContain('Contractul cu Maria Popescu nu are luna în care plătești arenda, așa că nu e în plan.');
  });

  it('puts the rent in the calendar, after the tax kept back', async () => {
    const { me, saved } = farmWith({ lease_contracts: [contract({ rent_kg_per_ha: null, rent_crop_id: null, rent_bani_per_ha: 100_000, pay_month: 11 })] });
    await showPage('calendar', 'farm', saved, true, me);
    expect(text()).toContain('Arenda pentru Maria Popescu');
  });

  it('on Ion’s farm says all the land is his', async () => {
    await showPage('arenda', 'demo');
    expect(text()).toContain('Ferma lui Ion e toată pe pământul lui.');
    expect(screen.queryByRole('button', { name: 'Adaugă un proprietar' })).toBeNull();
  });
});

describe('the Arendă tab', () => {
  it('shows on an arendaș’s farm, and on a farm on its own land only once it has arendă', async () => {
    const tab = () => screen.queryAllByRole('link', { name: /Arendă/ }).length > 0;
    const arendas = farmWith();
    await showPage('acasa', 'farm', arendas.saved, true, arendas.me);
    expect(tab()).toBe(true);
    cleanup();
    await showPage('acasa', 'farm', SIGNED_IN, true, ME);
    expect(tab()).toBe(false);
    cleanup();
    const gives = farmWith({ farm_mode: 'own', landowners: [], lease_contracts: [], leased_out_ari: 3000 });
    await showPage('acasa', 'farm', gives.saved, true, gives.me);
    expect(tab()).toBe(true);
  });
});

describe('„De la câți proprietari?” at onboarding', () => {
  it('doesn’t ask a farm on its own land with nothing in arendă', async () => {
    await showOnboarding();
    await submit();
    expect(document.getElementById('leasedIn')).toBeTruthy();
    expect(document.getElementById('owners')).toBeNull();
  });

  it('asks an arendaș, and saves the count after the farm', async () => {
    const me = { ...ME, farm_mode: 'arendas' };
    const { live } = await showOnboarding({ ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) }, true, me);
    await submit();
    fireEvent.change(document.getElementById('owners')!, { target: { value: 'patruzeci' } });
    await submit();
    expect(screen.getByText(/Scrie câți proprietari ai/)).toBeTruthy();
    fireEvent.change(document.getElementById('owners')!, { target: { value: '40' } });
    await submit();
    await submit();
    await submit();
    await vi.waitFor(() => expect(writes(live).map(([n]) => n)).toContain('set_landowner_count'));
    expect(writes(live).find(([n]) => n === 'set_landowner_count')![1]).toEqual({ count: 40 });
  });
});
