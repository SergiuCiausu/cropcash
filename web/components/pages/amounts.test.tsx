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
    expect(screen.getByText(/^Adică 12\.500 lei$/)).toBeTruthy();
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

describe('Onboarding, the money step', () => {
  async function reachMoney() {
    const page = await showOnboarding();
    const form = document.querySelector('form')!;
    type(document.getElementById('name')!, 'Maria');
    type(document.getElementById('age')!, '56');
    type(document.getElementById('county')!, 'TR');
    await submit(form);
    type(screen.getByLabelText('Hectare Grâu'), '5');
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
