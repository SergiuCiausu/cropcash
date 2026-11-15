// @vitest-environment happy-dom
/* Lei fields read amounts the way farmers type them, and refuse what they can't read (F-01). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { showOnboarding, showPage, SIGNED_IN } from './harness';

beforeAll(() => import('recharts'), 120_000);

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  localStorage.clear();
  history.replaceState(null, '');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });
const submit = async (form: Element) => {
  await act(async () => {
    fireEvent.submit(form);
  });
  await act(async () => undefined);
};
const callsTo = (write: ReturnType<typeof vi.fn>, name: string) => write.mock.calls.filter((c) => c[0] === name);

describe('Recolte, noting a sale', () => {
  const fillAmount = async (text: string) => {
    const page = await showPage('recolte', 'farm', SIGNED_IN);
    const form = document.querySelector('form.h-record')!;
    type(form.querySelector('input[inputmode="numeric"]')!, text);
    return { ...page, form };
  };

  it.each([
    ['12 500', 12500],
    ['12.500', 12500],
    ['12,500', 12500],
  ])('saves %s as the full amount', async (text, lei) => {
    const { live, form } = await fillAmount(text);
    expect(screen.getByText(/^Adică 12\.500 lei \(/)).toBeTruthy();
    await submit(form);
    expect(callsTo(live.write as never, 'record_sale')[0][1]).toMatchObject({ totalLei: lei });
  });

  it('refuses an amount it cannot read', async () => {
    const { live, form } = await fillAmount('12,5');
    await submit(form);
    expect(callsTo(live.write as never, 'record_sale')).toHaveLength(0);
    expect(form.querySelector('.ob-err')?.textContent).toMatch(/lei întregi/);
  });
});

describe('Recolte, an amount per hectare (docs/per-ha-total-plan.md)', () => {
  const unit = (form: Element, name: string) => [...form.querySelectorAll<HTMLButtonElement>('.basis-switch button')].find((b) => b.textContent === name)!;
  const open = async () => {
    const page = await showPage('recolte', 'farm', SIGNED_IN);
    return { ...page, form: document.querySelector('form.h-record')! };
  };

  it('saves a sale typed per hectare as the total for that crop', async () => {
    const { live, form } = await open();
    expect(unit(form, 'Total').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(unit(form, 'Pe hectar'));
    type(form.querySelector('input[inputmode="numeric"]')!, '1.000');
    const echo = form.querySelector('.amount-echo')!.textContent!;
    const [, ha, total] = /^Adică 1\.000 lei\/ha × ([\d,.]+) ha = ([\d.]+) lei$/.exec(echo)!;
    expect(+total.replace(/\./g, '')).toBe(Math.round(1000 * +ha.replace(/\./g, '').replace(',', '.')));
    await submit(form);
    expect(callsTo(live.write as never, 'record_sale')[0][1]).toMatchObject({ totalLei: +total.replace(/\./g, '') });
  });

  it('flipping keeps the same amount', async () => {
    const { form } = await open();
    const input = form.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    type(input, '1.000');
    fireEvent.click(unit(form, 'Pe hectar'));
    fireEvent.click(unit(form, 'Total'));
    expect(input.value).toBe('1.000');
  });

  it('remembers the unit for the next record', async () => {
    const first = await open();
    fireEvent.click(unit(first.form, 'Pe hectar'));
    cleanup();
    const { form } = await open();
    expect(unit(form, 'Pe hectar').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens rent per hectare until a unit was picked', async () => {
    const { form } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cheltuială' }));
    fireEvent.change(form.querySelector('select')!, { target: { value: 'rent' } });
    expect(unit(form, 'Pe hectar').getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(form.querySelector('select')!, { target: { value: 'diesel' } });
    expect(unit(form, 'Total').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Onboarding, the money step', () => {
  async function reachMoney() {
    const page = await showOnboarding();
    const form = document.querySelector('form')!;
    type(document.getElementById('name')!, 'Maria');
    type(document.getElementById('age')!, '56');
    type(document.getElementById('county')!, 'TR');
    await submit(form);
    type(screen.getByLabelText('Hectare Grâu comun de toamnă'), '5');
    await submit(form);
    // The people step: skipped.
    await submit(form);
    return { ...page, form };
  }

  it.each(['35 000', '35.000', '35,000'])('saves %s as the full amount', async (text) => {
    const { live, form } = await reachMoney();
    type(document.getElementById('money')!, text);
    await submit(form);
    expect(callsTo(live.write as never, 'update_farm')[0][1]).toMatchObject({ startBalanceLei: 35000 });
  });

  it('refuses an amount it cannot read', async () => {
    const { live, form } = await reachMoney();
    type(document.getElementById('money')!, '35,5');
    await submit(form);
    expect(callsTo(live.write as never, 'update_farm')).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toMatch(/ca număr/);
  });
});
