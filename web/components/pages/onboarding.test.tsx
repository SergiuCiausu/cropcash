// @vitest-environment happy-dom
/* Onboarding again on a saved farm keeps what's there, typing survives a reload, Back moves between
   steps, and the last page leads with the salary (F-04, F-14, F-06). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, showOnboarding, SIGNED_IN } from './harness';
import { loadData } from '../../../packages/shared/src/data/index';
import type { PaperReading } from '../../lib/cc/store';

/* The real sheet opens a file picker. Here the paper is already read: pick() gives the reading. */
const papers = vi.hoisted(() => ({ pick: vi.fn(), tell: vi.fn(), confirmDecision: vi.fn() }));
vi.mock('../app/Papers', async (original) => ({ ...(await original<typeof import('../app/Papers')>()), usePapers: () => papers }));

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
/** „Cum lucrezi pământul?”: a new account has to pick. */
const pickMode = (name: RegExp = /Pământul e al meu/) => fireEvent.click(screen.getByRole('button', { name }));

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
    expect((screen.getByLabelText('Hectare Grâu comun de toamnă') as HTMLInputElement).value).toBe('5');
    await submit();
    expect(screen.getByRole('heading', { name: 'Cine lucrează la fermă?' })).toBeTruthy();
    await submit();
    expect(field('money').value).toBe('20.000');
    expect(screen.queryByRole('button', { name: 'Nu știu, sar peste' })).toBeNull();
  });

  it('keeps the balance when nothing was touched', async () => {
    const { live } = await showOnboarding();
    await submit();
    await submit();
    await submit();
    await submit();
    expect(write(live, 'update_farm')[0][1]).toMatchObject({ startBalanceLei: 20000, farmMode: 'own' });
  });

  it('refuses an emptied balance instead of saving zero', async () => {
    const { live } = await showOnboarding();
    await submit();
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
    await submit();
    const { parcels } = write(live, 'update_farm')[0][1] as { parcels: { cropId: string; areaHa: number }[] };
    expect(parcels).toContainEqual({ cropId: own.id, areaHa: 2 });
  });
});

describe('On a new account', () => {
  it('still lets the farmer skip the money', async () => {
    await showOnboarding(NEW_ACCOUNT);
    expect(field('name').value).toBe('');
    pickMode();
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    type(screen.getByLabelText('Hectare Grâu comun de toamnă'), '5');
    await submit();
    await submit();
    expect(screen.getByRole('button', { name: 'Nu știu, sar peste' })).toBeTruthy();
  });
});

describe('Crops from the APIA list', () => {
  const search = () => screen.getByLabelText('Altă cultură');

  it('shows the main crops with their APIA code, and the other lines only once picked', async () => {
    await showOnboarding(NEW_ACCOUNT);
    pickMode();
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    expect(screen.getByText('cod APIA 101')).toBeTruthy();
    expect(screen.queryByLabelText('Hectare Grâu dur de primăvară')).toBeNull();
    type(search(), 'grau dur primavara');
    fireEvent.click(screen.getByRole('button', { name: /Grâu dur de primăvară/ }));
    type(screen.getByLabelText('Hectare Grâu dur de primăvară'), '3');
    await submit();
    await submit();
    expect(screen.getByRole('button', { name: 'Nu știu, sar peste' })).toBeTruthy();
  });

  it('says where to add a crop without figures, instead of guessing them', async () => {
    await showOnboarding(NEW_ACCOUNT);
    pickMode();
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    type(search(), 'rapita');
    expect(screen.getByRole('button', { name: /Rapiţă de toamnă.*cod APIA 202.*scrii tu cifrele/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rapiţă de toamnă/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Rapiţă de toamnă \(cod APIA 202\) nu avem încă costuri și prețuri.*Recolte/);
    expect(screen.queryByLabelText('Hectare Rapiţă de toamnă')).toBeNull();
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
    await submit();
    expect(localStorage.length).toBe(1);
    await submit();
    expect(localStorage.length).toBe(0);
  });

  it('adds one history entry per step, and Back returns to the step before', async () => {
    await showOnboarding();
    await submit();
    expect(history.state.ccStep).toBe(1);
    expect(screen.getByLabelText('Hectare Grâu comun de toamnă')).toBeTruthy();
    history.replaceState({ ccStep: 0, ccFrom: 0 }, '');
    await act(async () => {
      dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(field('name')).toBeTruthy();
  });
});

describe('The cerere de plată', () => {
  const year = loadData().subsidies.meta.campaign_year;
  const cerere = (over: Partial<PaperReading> = {}): PaperReading => ({
    kind: 'apia_cerere',
    year,
    parcels: [
      { cropId: 'porumb', areaAri: 720 },
      { cropId: 'floarea-soarelui', areaAri: 350 },
    ],
    unknownCrops: [],
    amountBani: null,
    date: null,
    category: null,
    cropId: null,
    applicant: { firstName: 'Ion', fullName: 'Ion Popescu', age: 60, county: 'DB' },
    totalAri: null,
    ...over,
  });
  const upload = async (reading: PaperReading) => {
    papers.pick.mockResolvedValueOnce(reading);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Încarcă cererea' }));
    });
    await act(async () => undefined);
  };
  const hectares = (crop: string) => (screen.getByLabelText(`Hectare ${crop}`) as HTMLInputElement).value;
  const tags = () => screen.queryAllByText('din cerere').length;
  beforeEach(() => papers.pick.mockReset());

  it('fills in a new farm from the paper, and the farmer only checks it', async () => {
    await showOnboarding(NEW_ACCOUNT);
    await upload(cerere());
    expect(papers.pick).toHaveBeenCalledWith(expect.objectContaining({ accepts: ['apia_cerere'], pages: true }));
    expect(field('name').value).toBe('Ion');
    expect(field('age').value).toBe('60');
    expect(field('county').value).toBe('DB');
    expect(tags()).toBe(3);
    expect(screen.getByText(/Am adăugat porumb \(7,2 ha\) și floarea soarelui \(3,5 ha\)/)).toBeTruthy();
    pickMode();
    await submit();
    expect(hectares('Porumb')).toBe('7,2');
    expect(hectares('Floarea soarelui')).toBe('3,5');
  });

  it('lets the farmer choose the name, and keeps the one already typed', async () => {
    await showOnboarding();
    await upload(cerere());
    expect(field('name').value).toBe('Maria');
    expect(tags()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Ion Popescu' }));
    expect(field('name').value).toBe('Ion Popescu');
    expect(screen.getByRole('button', { name: 'Ion Popescu' }).getAttribute('aria-pressed')).toBe('true');
    expect(tags()).toBe(3);
  });

  it('adds what is missing, replaces what differs, and keeps what the paper does not list', async () => {
    const { live } = await showOnboarding();
    await upload(cerere());
    expect(screen.getByText(/Am schimbat porumb: 3 → 7,2 ha\./)).toBeTruthy();
    expect(screen.getByText(/nu le-am schimbat: grâu comun de toamnă \(5 ha\)/)).toBeTruthy();
    await submit();
    expect(hectares('Grâu comun de toamnă')).toBe('5');
    expect(hectares('Porumb')).toBe('7,2');
    await submit();
    await submit();
    await submit();
    const { parcels } = write(live, 'update_farm')[0][1] as { parcels: { cropId: string; areaHa: number }[] };
    expect(parcels).toEqual(
      expect.arrayContaining([expect.objectContaining({ cropId: 'grau', areaHa: 5 }), expect.objectContaining({ cropId: 'porumb', areaHa: 7.2 }), expect.objectContaining({ cropId: 'floarea-soarelui', areaHa: 3.5 })]),
    );
  });

  it('leaves empty what the paper does not have, and says so', async () => {
    await showOnboarding(NEW_ACCOUNT);
    await upload(cerere({ applicant: { firstName: 'Ion', fullName: 'Ion Popescu', age: null, county: 'DB' } }));
    expect(field('age').value).toBe('');
    expect(screen.getByText(/Nu am găsit vârsta\. Scrie tu\./)).toBeTruthy();
  });

  it('drops the tag once the farmer changes the field', async () => {
    await showOnboarding(NEW_ACCOUNT);
    await upload(cerere());
    type(field('age'), '61');
    expect(tags()).toBe(2);
  });

  it('warns about another year and a total that does not add up', async () => {
    await showOnboarding(NEW_ACCOUNT);
    await upload(cerere({ year: year - 1, totalAri: 1595 }));
    expect(screen.getByText(new RegExp(`E cererea din ${year - 1}\\.`))).toBeTruthy();
    expect(screen.getByText(/Pe cerere scrie 15,95 ha în total, iar noi am găsit 10,7 ha\. Poate lipsește o pagină\./)).toBeTruthy();
  });

  it('keeps the tags and the note after a reload', async () => {
    await showOnboarding(NEW_ACCOUNT);
    await upload(cerere());
    cleanup();
    await showOnboarding(NEW_ACCOUNT);
    expect(field('name').value).toBe('Ion');
    expect(tags()).toBe(3);
    expect(screen.getByText(/Am completat de pe cerere/)).toBeTruthy();
  });

  it('is off without internet, and typing still works', async () => {
    await showOnboarding(SIGNED_IN, false);
    expect((screen.getByRole('button', { name: 'Încarcă cererea' }) as HTMLButtonElement).disabled).toBe(true);
    type(field('name'), 'Ana');
    expect(field('name').value).toBe('Ana');
  });
});

describe('The last page', () => {
  it('leads with the salary and goes to the farm', async () => {
    await showOnboarding();
    await submit();
    await submit();
    await submit();
    await submit();
    expect(screen.getByText('Salariul tău')).toBeTruthy();
    expect(screen.getByText(/ pe lună$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mergi la ferma ta' }).getAttribute('href')).toBe('/acasa');
  });
});

describe('How the farm works its land, and its people (plan step 5)', () => {
  /** What the farm was saved with: the harness answers /api/me with a farm, so even a new account saves through update_farm. */
  const posted = (live: { write: unknown }) => write(live, 'update_farm')[0][1];
  async function newFarm(mode: RegExp = /Iau pământ în arendă/) {
    const page = await showOnboarding(NEW_ACCOUNT);
    pickMode(mode);
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    type(screen.getByLabelText('Hectare Grâu comun de toamnă'), '150');
    return page;
  }

  it('asks a new farm how it works its land before going on', async () => {
    await showOnboarding(NEW_ACCOUNT);
    type(field('name'), 'Ana');
    type(field('age'), '50');
    type(field('county'), 'TR');
    await submit();
    expect(screen.getByRole('alert').textContent).toBe('Alege cum lucrezi pământul.');
    expect(field('name')).toBeTruthy();
    pickMode();
    expect(screen.getByRole('button', { name: /Pământul e al meu/ }).getAttribute('aria-pressed')).toBe('true');
    await submit();
    expect(screen.getByLabelText('Hectare Grâu comun de toamnă')).toBeTruthy();
  });

  it('sends the mode and the arendă hectares with the new farm', async () => {
    const { live } = await newFarm();
    type(field('leasedIn'), '120,5');
    type(field('leasedOut'), '10');
    await submit();
    await submit();
    await submit();
    expect(posted(live)).toMatchObject({ farmMode: 'arendas', leasedInHa: 120.5, leasedOutHa: 10 });
  });

  it('leaves the arendă hectares out when they are not answered', async () => {
    const { live } = await newFarm(/Pământul e al meu/);
    await submit();
    await submit();
    await submit();
    const body = posted(live);
    expect(body.farmMode).toBe('own');
    expect(body).not.toHaveProperty('leasedInHa');
    expect(body).not.toHaveProperty('leasedOutHa');
  });

  it('refuses more hectares in arendă than the farm has', async () => {
    await newFarm();
    type(field('leasedIn'), '200');
    await submit();
    expect(screen.getByRole('alert').textContent).toContain('Ai 150 ha în total');
    type(field('leasedIn'), 'mult');
    await submit();
    expect(screen.getByRole('alert').textContent).toContain('Scrie hectarele ca număr');
  });

  it('adds the people with their total cost, and the field-work answer, after the farm', async () => {
    const { live } = await newFarm();
    await submit();
    expect(screen.getByRole('button', { name: 'Sar peste' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Adaugă un om/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mai adaug un om/ }));
    const names = screen.getAllByLabelText('Numele');
    const costs = screen.getAllByLabelText(/Cât te costă pe lună/);
    type(names[0]!, 'Nelu');
    type(costs[0]!, '7.500');
    type(names[1]!, 'Gheorghe');
    type(costs[1]!, '6000');
    fireEvent.click(screen.getByRole('button', { name: 'Da' }));
    await submit();
    await submit();
    const people = write(live, 'add_employee').map((c) => c[1]);
    expect(people).toEqual([
      expect.objectContaining({ name: 'Nelu', kind: 'permanent', costLei: 7500, payBasis: 'month', startsOn: '2026-11-15' }),
      expect.objectContaining({ name: 'Gheorghe', costLei: 6000 }),
    ]);
    expect(people[0].clientId).not.toBe(people[1].clientId);
    expect(write(live, 'set_own_field_work')[0][1]).toEqual({ ownFieldWork: true });
  });

  it('says what is missing for a person, and lets a row go', async () => {
    const { live } = await newFarm();
    await submit();
    fireEvent.click(screen.getByRole('button', { name: /Adaugă un om/ }));
    type(screen.getByLabelText('Numele'), 'Nelu');
    await submit();
    expect(screen.getByRole('alert').textContent).toBe('Scrie cât te costă Nelu pe lună, în lei întregi.');
    fireEvent.click(screen.getByRole('button', { name: 'Scoate Nelu' }));
    await submit();
    await submit();
    expect(write(live, 'add_employee')).toHaveLength(0);
    expect(write(live, 'set_own_field_work')).toHaveLength(0);
  });

  it('opens a saved farm with its mode and arendă hectares, and its people named', async () => {
    const me = {
      ...ME,
      farm_mode: 'arendas',
      leased_in_ari: 250,
      leased_out_ari: null,
      employees: [{ id: 'p1', name: 'Nelu', archived_at: null }],
      own_field_work: true,
    };
    await showOnboarding({ ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) }, true, me);
    expect(screen.getByRole('button', { name: /Iau pământ în arendă/ }).getAttribute('aria-pressed')).toBe('true');
    await submit();
    expect(field('leasedIn').value).toBe('2,5');
    expect(field('leasedOut').value).toBe('');
    await submit();
    expect(screen.getByText(/Ai deja un om în listă: Nelu\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Da' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('asks for the cerere as a PDF first', async () => {
    papers.pick.mockResolvedValueOnce(null);
    await showOnboarding(NEW_ACCOUNT);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Încarcă cererea' }));
    });
    expect(papers.pick.mock.calls.at(-1)![0].hint).toMatch(/^Cel mai bine e PDF-ul cererii/);
  });
});
