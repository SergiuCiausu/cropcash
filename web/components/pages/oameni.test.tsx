// @vitest-environment happy-dom
/* Oameni (docs/employees-arenda-plan.md §1.5): the people, „Am plătit salariile”, the field-work question,
   and the payroll warning and own-cost card on the other pages. */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NELU = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const ANA = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
const person = (over: object = {}) => ({
  id: NELU,
  name: 'Nelu',
  role: 'tractorist',
  kind: 'permanent',
  cost_bani: 750_000,
  pay_basis: 'month',
  days_per_month: null,
  active_months: null,
  pay_day: 10,
  starts_on: '2026-01-01',
  ends_on: null,
  archived_at: null,
  ...over,
});
const ANA_LEFT = person({ id: ANA, name: 'Ana', role: null, archived_at: '2026-09-30T10:00:00Z', ends_on: '2026-09-30' });

function farmWith(over: object = {}) {
  const me = { ...ME, start_balance_bani: 50_000_000, employees: [person(), ANA_LEFT], own_field_work: null, ...over };
  return { me, saved: { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) } };
}
const main = () => document.querySelector('main')!;
const text = () => main().textContent!;
const writes = (live: { write: unknown }) => (live.write as ReturnType<typeof vi.fn>).mock.calls;

describe('Oameni', () => {
  it('lists the people, what each costs a month, and the ones who left apart', async () => {
    const { me, saved } = farmWith();
    await showPage('oameni', 'farm', saved, true, me);
    const list = screen.getByRole('heading', { name: 'Oamenii fermei' }).closest('section')!;
    const rows = within(list).getAllByRole('button');
    expect(rows[0]!.textContent).toContain('Nelu');
    expect(rows[0]!.textContent).toContain('7.500 lei');
    expect(text()).toContain('Au plecat (1)');
    expect(screen.getByRole('heading', { name: 'Cât te costă pe lună' }).closest('section')!.textContent).toContain('7.500 lei');
  });

  it('notes the month’s pay as salary expenses, with the person and the envelope', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('oameni', 'farm', saved, true, me);
    expect(text()).toContain('Salariile pe noiembrie');
    const field = screen.getByLabelText(/^Nelu/) as HTMLInputElement;
    expect(field.value).toBe('7500');
    fireEvent.change(field, { target: { value: '7.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Am plătit salariile pe noiembrie' }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    const [name, input] = writes(live)[0]!;
    expect(name).toBe('add_expense');
    expect(input).toMatchObject({ category: 'salaries', amountLei: 7000, date: '2026-11-15', employeeId: NELU, envelope: 'payroll' });
    expect(input.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('says the month is done once each person’s pay is noted', async () => {
    const { me, saved } = farmWith({ transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id: NELU, crop_id: null, amount_bani: -750_000, occurred_at: '2026-11-10T12:00:00Z', note: null, source: 'manual' }] });
    await showPage('oameni', 'farm', saved, true, me);
    expect(text()).toContain('Salariile pe noiembrie sunt notate.');
    expect(screen.queryByRole('button', { name: /Am plătit salariile/ })).toBeNull();
  });

  it('without internet: the pay waits in the queue, adding a person waits for internet', async () => {
    const { me, saved } = farmWith();
    const { live, store } = await showPage('oameni', 'farm', saved, false, me);
    expect((screen.getByRole('button', { name: 'Adaugă un om' }) as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('Un om nou se adaugă când ai internet.');
    fireEvent.click(screen.getByRole('button', { name: 'Am plătit salariile pe noiembrie' }));
    await vi.waitFor(() => expect(store.getState().farm!.me!.transactions).toHaveLength(1));
    expect(live.write).not.toHaveBeenCalled();
    expect(store.getState().farm!.me!.transactions![0]).toMatchObject({ category: 'salaries', employee_id: NELU, pending: true });
    // The queued pay already counts: nothing is left to note this month.
    expect(text()).toContain('Salariile pe noiembrie sunt notate.');
  });

  it('adds a zilier with the day cost, the days and the months', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('oameni', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă un om' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Adaugă un om', hidden: true }));
    fireEvent.click(sheet.getByRole('button', { name: 'Zilier', hidden: true }));
    fireEvent.change(sheet.getByLabelText('Numele'), { target: { value: 'Vasile' } });
    fireEvent.change(sheet.getByLabelText('Cât te costă pe zi, în lei'), { target: { value: '200' } });
    fireEvent.change(sheet.getByLabelText('Câte zile pe lună vine'), { target: { value: '12' } });
    fireEvent.click(sheet.getByRole('button', { name: 'iul.', hidden: true }));
    fireEvent.click(sheet.getByRole('button', { name: 'aug.', hidden: true }));
    fireEvent.click(sheet.getByRole('button', { name: 'Adaugă', hidden: true }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    const [name, input] = writes(live)[0]!;
    expect(name).toBe('add_employee');
    expect(input).toMatchObject({ name: 'Vasile', kind: 'zilier', costLei: 200, payBasis: 'day', daysPerMonth: 12, activeMonths: [7, 8], startsOn: '2026-11-15' });
    expect(input).not.toHaveProperty('payDay');
  });

  it('says what is missing before saving a person', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('oameni', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă un om' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Adaugă un om', hidden: true }));
    fireEvent.change(sheet.getByLabelText('Numele'), { target: { value: 'Ion' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Adaugă', hidden: true }));
    expect(sheet.getByRole('alert', { hidden: true }).textContent).toContain('Scrie cât te costă pe lună');
    expect(live.write).not.toHaveBeenCalled();
  });

  it('moves a person to „Au plecat” with their last day', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('oameni', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: /^Nelu/ }));
    const sheet = within(screen.getByRole('dialog', { name: 'Schimbă', hidden: true }));
    fireEvent.click(sheet.getByRole('button', { name: 'A plecat', hidden: true }));
    fireEvent.change(sheet.getByLabelText('Ultima zi de lucru'), { target: { value: '2026-11-30' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Mută la „Au plecat”', hidden: true }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    expect(writes(live)[0]).toEqual(['archive_employee', { id: NELU, endsOn: '2026-11-30' }, {}]);
  });

  it('asks whether the farm’s own people do the field work', async () => {
    const { me, saved } = farmWith();
    const { live } = await showPage('oameni', 'farm', saved, true, me);
    fireEvent.click(screen.getByRole('button', { name: 'Da' }));
    await vi.waitFor(() => expect(writes(live)).toHaveLength(1));
    expect(writes(live)[0]!.slice(0, 2)).toEqual(['set_own_field_work', { ownFieldWork: true }]);
  });

  it('warns when the money doesn’t reach the people’s pay', async () => {
    const { me, saved } = farmWith({ start_balance_bani: 0, employees: [person({ cost_bani: 50_000_000 })] });
    await showPage('oameni', 'farm', saved, true, me);
    expect(text()).toMatch(/În \w+ nu ajung banii de salariile oamenilor/);
  });

  it('on Ion’s farm says there are no people to show', async () => {
    await showPage('oameni', 'demo');
    expect(text()).toContain('Pe ferma lui Ion nu sunt oameni angajați.');
    expect(screen.queryByRole('button', { name: 'Adaugă un om' })).toBeNull();
  });
});

describe('the people on other pages', () => {
  it('Acasă and Salariu warn first when the people’s pay doesn’t fit', async () => {
    const { me, saved } = farmWith({ start_balance_bani: 0, employees: [person({ cost_bani: 50_000_000 })] });
    await showPage('acasa', 'farm', saved, true, me);
    expect(text()).toMatch(/nu ajung banii de salariile oamenilor/);
    expect(screen.getByRole('link', { name: 'Vezi oamenii' }).getAttribute('href')).toBe('/oameni');
    cleanup();
    await showPage('salariu', 'farm', saved, true, me);
    expect(text()).toMatch(/nu ajung banii de salariile oamenilor/);
  });

  it('shows nothing about pay on a farm without people', async () => {
    await showPage('acasa', 'farm', SIGNED_IN, true, ME);
    expect(text()).not.toMatch(/salariile oamenilor/);
  });

  it('Recolte asks for the farm’s own cost per ha once the people do the field work', async () => {
    const { me, saved } = farmWith({ own_field_work: true });
    await showPage('recolte', 'farm', saved, true, me);
    const card = screen.getByRole('heading', { name: 'Costul pe hectar al fermei tale' }).closest('section')!;
    expect(card.textContent).toContain('La grâu comun de toamnă și porumb planul folosește încă media');
    expect(within(card).getByRole('link', { name: 'Scrie costul pe hectar' }).getAttribute('href')).toBe('/date-plan');
    cleanup();
    const no = farmWith({ own_field_work: false });
    await showPage('recolte', 'farm', no.saved, true, no.me);
    expect(screen.queryByRole('heading', { name: 'Costul pe hectar al fermei tale' })).toBeNull();
  });

  it('Calendar shows each pay day with the person’s name', async () => {
    const { me, saved } = farmWith();
    await showPage('calendar', 'farm', saved, true, me);
    expect(text()).toContain('Salariu: Nelu');
    expect(text()).not.toContain('Salariu: Ana');
  });

  it('Recolte names the person on a salary expense', async () => {
    const { me, saved } = farmWith({ transactions: [{ id: 't1', kind: 'expense', category: 'salaries', employee_id: NELU, crop_id: null, amount_bani: -750_000, occurred_at: '2026-11-10T12:00:00Z', note: null, source: 'manual' }] });
    await showPage('recolte', 'farm', saved, true, me);
    expect(text()).toContain('Salarii: Nelu');
  });
});
