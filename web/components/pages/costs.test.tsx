// @vitest-environment happy-dom
/* What a crop costs: the figure on Datele planului and what was really spent, on Recolte. */
import { cleanup, fireEvent, screen } from '@testing-library/react';
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

const expense = (crop_id: string | null, category: string, amount_bani: number, harvest_year: number) => ({ id: `t-${crop_id}-${category}-${harvest_year}`, kind: 'expense', category, crop_id, amount_bani, occurred_at: '2026-11-05T12:00:00Z', note: null, source: 'manual', harvest_year });
const farmWith = (transactions: object[], harvests: object | null = null) => {
  const me = { ...ME, transactions, harvests, harvests_version: 3 };
  return { me, saved: { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) } };
};
const LAST_YEAR = { year: 2026, status: 'closed', openingBani: 0, parcels: [{ cropId: 'grau', areaHa: 5 }, { cropId: 'porumb', areaHa: 3 }] };
const costFields = () => screen.getAllByLabelText('Costuri pe tot sezonul, lei/ha') as HTMLInputElement[];
const text = () => document.querySelector('main')!.textContent!;

describe('Datele planului', () => {
  it('starts from the average and shows what it comes to', async () => {
    const { me, saved } = farmWith([]);
    await showPage('date-plan', 'farm', saved, true, me);
    expect(costFields()[0]!.value).toBe('4.250');
    expect(text()).toContain('4.250 lei/ha × 5 ha = 21.250 lei pe sezon.');
  });

  it("saves the farmer's cost with the rest of the plan", async () => {
    const { me, saved } = farmWith([]);
    const { live } = await showPage('date-plan', 'farm', saved, true, me);
    fireEvent.change(costFields()[0]!, { target: { value: '3.800' } });
    expect(text()).toContain('3.800 lei/ha × 5 ha = 19.000 lei pe sezon.');
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await vi.waitFor(() => expect(live.write).toHaveBeenCalled());
    const [name, input] = (live.write as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(name).toBe('save_harvests');
    expect(input.expected).toEqual([{ cropId: 'grau', yieldTPerHa: null, priceLeiPerKg: null, costLeiPerHa: 3800 }]);
  });

  it('refuses a cost that is not a whole number', async () => {
    const { me, saved } = farmWith([]);
    await showPage('date-plan', 'farm', saved, true, me);
    fireEvent.change(costFields()[0]!, { target: { value: 'mult' } });
    expect(text()).toContain('Scrie costul în lei întregi pe hectar');
    expect((screen.getByRole('button', { name: 'Salvează' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers the cost from a finished harvest, and fills the field without saving', async () => {
    const { me, saved } = farmWith([expense('grau', 'seeds', -2_000_000, 2026)], { years: [LAST_YEAR], gathered: [] });
    const { live } = await showPage('date-plan', 'farm', saved, true, me);
    expect(text()).toContain('Din cheltuielile tale, Recolta 2026: 4.000 lei/ha.');
    fireEvent.click(screen.getByRole('button', { name: 'Folosește cifra asta' }));
    expect(costFields()[0]!.value).toBe('4.000');
    expect(live.write).not.toHaveBeenCalled();
  });

  it('warns when the expenses add up to less than usual', async () => {
    const { me, saved } = farmWith([expense('grau', 'seeds', -50_000, 2026)], { years: [LAST_YEAR], gathered: [] });
    await showPage('date-plan', 'farm', saved, true, me);
    expect(text()).toContain('100 lei/ha. Poate lipsesc cheltuieli.');
  });

  it('offers nothing while the season still runs', async () => {
    const { me, saved } = farmWith([expense('grau', 'seeds', -2_000_000, 2027)]);
    await showPage('date-plan', 'farm', saved, true, me);
    expect(screen.queryByRole('button', { name: 'Folosește cifra asta' })).toBeNull();
  });
});

describe('Recolte', () => {
  it('shows what each crop cost per hectare so far, shared costs split by hectares', async () => {
    const { me, saved } = farmWith([expense('grau', 'seeds', -500_000, 2027), expense(null, 'diesel', -160_000, 2027)]);
    await showPage('recolte', 'farm', saved, true, me);
    const card = [...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === 'Cheltuieli pe hectar')!;
    expect(card.textContent).toContain('Grâu, 5 ha');
    expect(card.textContent).toContain('Până acum');
    expect(card.textContent).toContain('Sămânță');
    expect(card.textContent).toContain('1.000 lei'); // 5.000 lei of seed on 5 ha
    expect(card.textContent).toContain('împărțite după hectare');
  });

  it('says how to start when nothing was noted', async () => {
    const { me, saved } = farmWith([]);
    await showPage('recolte', 'farm', saved, true, me);
    expect(text()).toContain('Nu ai notat încă nicio cheltuială.');
  });
});

describe('Prognoză', () => {
  it('links to where costs change', async () => {
    const { me, saved } = farmWith([]);
    await showPage('prognoza', 'farm', saved, true, me);
    expect(screen.getByRole('link', { name: 'Schimbă costurile' })).toBeTruthy();
  });
});
