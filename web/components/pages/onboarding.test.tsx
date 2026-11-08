// @vitest-environment happy-dom
/* Onboarding again on a saved farm keeps what's there, typing survives a reload, Back moves between
   steps, and the last page leads with the salary (F-04, F-14, F-06). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showOnboarding, SIGNED_IN } from './harness';

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

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });
const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!);
  });
  await act(async () => undefined);
  await act(async () => undefined);
};
const write = (live: { write: unknown }, name: string) => (live.write as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === name);
const NEW_ACCOUNT = { 'sb-x-auth-token': '{}' };

const own = {
  id: 'own-lavanda',
  name: 'Lavandă',
  yieldTPerHa: 1,
  badYieldTPerHa: null,
  priceLeiPerKg: 10,
  costs: { sowingLeiPerHa: 100, careLeiPerHa: 100, harvestLeiPerHa: 100 },
  sowingMonth: 3,
  harvestMonth: 7,
};

describe('On a saved farm', () => {
  it('opens with what is saved', async () => {
    await showOnboarding();
    expect(field('name').value).toBe('Maria');
    expect(field('age').value).not.toBe('');
    expect(field('county').value).toBe('TR');
    await submit();
    expect((screen.getByLabelText('Hectare Grâu') as HTMLInputElement).value).toBe('5');
    await submit();
    expect(field('money').value).toBe('20.000');
    expect(screen.queryByRole('button', { name: 'Nu știu, sar peste' })).toBeNull();
  });

  it('keeps the balance when nothing was touched', async () => {
    const { live } = await showOnboarding();
    await submit();
    await submit();
    await submit();
    expect(write(live, 'update_farm')[0][1]).toMatchObject({ startBalanceLei: 20000 });
  });

  it('refuses an emptied balance instead of saving zero', async () => {
    const { live } = await showOnboarding();
    await submit();
    await submit();
    type(field('money'), '');
    await submit();
    expect(write(live, 'update_farm')).toHaveLength(0);
  });

  it('keeps the crops the farmer added', async () => {
    const me = { ...ME, parcels: [...ME.parcels, { crop_id: own.id, area_ari: 200 }], harvests: { years: [], gathered: [], ownCrops: [own] } };
    const { live } = await showOnboarding({ ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) }, true, me);
    await submit();
    expect(screen.getByText(/Păstrăm și Lavandă \(2 ha\)/)).toBeTruthy();
    await submit();
    await submit();
    const { parcels } = write(live, 'update_farm')[0][1] as { parcels: { cropId: string; areaHa: number }[] };
    expect(parcels).toContainEqual({ cropId: own.id, areaHa: 2 });
  });
});

describe('On a new account', () => {
  it('still lets the farmer skip the money', async () => {
    await showOnboarding(NEW_ACCOUNT);
    expect(field('name').value).toBe('');
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    type(screen.getByLabelText('Hectare Grâu'), '5');
    await submit();
    expect(screen.getByRole('button', { name: 'Nu știu, sar peste' })).toBeTruthy();
  });
});

describe('Typing and the phone', () => {
  it('survives the page starting over', async () => {
    await showOnboarding(NEW_ACCOUNT);
    type(field('name'), 'Ana');
    cleanup();
    await showOnboarding(NEW_ACCOUNT);
    expect(field('name').value).toBe('Ana');
  });

  it('is forgotten once saved', async () => {
    await showOnboarding();
    await submit();
    await submit();
    expect(localStorage.length).toBe(1);
    await submit();
    expect(localStorage.length).toBe(0);
  });

  it('adds one history entry per step, and Back returns to the step before', async () => {
    await showOnboarding();
    await submit();
    expect(history.state.ccStep).toBe(1);
    expect(screen.getByLabelText('Hectare Grâu')).toBeTruthy();
    history.replaceState({ ccStep: 0, ccFrom: 0 }, '');
    await act(async () => {
      dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(field('name')).toBeTruthy();
  });
});

describe('The last page', () => {
  it('leads with the salary and goes to the farm', async () => {
    await showOnboarding();
    await submit();
    await submit();
    await submit();
    expect(screen.getByText('Salariul tău')).toBeTruthy();
    expect(screen.getByText(/ pe lună$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mergi la ferma ta' }).getAttribute('href')).toBe('/acasa');
  });
});
