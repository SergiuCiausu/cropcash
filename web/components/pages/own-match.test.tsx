// @vitest-environment happy-dom
/* Recolte offers once to link a crop the farmer typed in to its APIA line (docs/crops-catalog-plan.md, step 11). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RAPE = {
  id: 'own-rapita-1',
  name: 'Rapiță',
  yieldTPerHa: 3,
  badYieldTPerHa: null,
  priceLeiPerKg: 2,
  costs: { sowingLeiPerHa: 1000, careLeiPerHa: 1200, harvestLeiPerHa: 500 },
  sowingMonth: 9,
  harvestMonth: 7,
};
const farmWith = (ownCrops: object[]) => {
  const me = {
    ...ME,
    parcels: [...ME.parcels, { crop_id: RAPE.id, area_ari: 200 }],
    harvests: { years: [{ year: 2027, status: 'open', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 5 }, { cropId: 'porumb', areaHa: 3 }, { cropId: RAPE.id, areaHa: 2 }] }], gathered: [], ownCrops },
    harvests_version: 3,
  };
  return { me, saved: { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) } };
};
const card = () => document.querySelector('.own-match') as HTMLElement | null;
const click = async (el: Element) => act(async () => void fireEvent.click(el));

describe('Recolte: an own crop found on the APIA list', () => {
  it('offers the lines, and linking saves the APIA name and code with the same figures', async () => {
    const { me, saved } = farmWith([RAPE]);
    const { live } = await showPage('recolte', 'farm', saved, true, me);
    expect(card()!.textContent).toContain('Rapiță e în lista APIA');
    expect(card()!.textContent).toContain('Păstrăm cifrele tale');
    await click(screen.getByRole('button', { name: /de primăvară, cod 2020$/ }));
    await vi.waitFor(() => expect(live.write).toHaveBeenCalled());
    const [name, doc] = (live.write as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(name).toBe('save_harvests');
    expect(doc.ownCrops).toEqual([{ ...RAPE, name: expect.stringMatching(/^Rapi.ă de primăvară$/), apiaCode: 2020 }]);
  });

  it('„Niciuna” saves nothing and isn\'t asked again on this phone', async () => {
    const { me, saved } = farmWith([RAPE]);
    const { live } = await showPage('recolte', 'farm', saved, true, me);
    await click(screen.getByRole('button', { name: 'Niciuna' }));
    expect(card()).toBeNull();
    expect(live.write).not.toHaveBeenCalled();
    cleanup();
    await showPage('recolte', 'farm', { ...saved, 'cropcash-own-match-seen': localStorage.getItem('cropcash-own-match-seen')! }, true, me);
    expect(card()).toBeNull();
  });

  it('says nothing for a crop already linked', async () => {
    const { me, saved } = farmWith([{ ...RAPE, apiaCode: 202 }]);
    await showPage('recolte', 'farm', saved, true, me);
    expect(card()).toBeNull();
  });
});
