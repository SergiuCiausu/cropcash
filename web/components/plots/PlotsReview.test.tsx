// @vitest-environment happy-dom
/* "Parcelele din cerere" (docs/harta-plan.md, step 2): the farmer checks the II.A rows, then saves. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { readPaperPlots, type PrintedPlotRow, type StoredPlot } from '../../../packages/shared/src/plots/index';
import { PlotsReview, SAVE_NEEDS_NET, plotTitle, whereText } from './PlotsReview';

let online = true;
vi.mock('../../lib/cc/react', async (orig) => ({ ...(await orig<object>()), useOnline: () => online }));

beforeEach(() => {
  online = true;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const data = loadData();
const code = (id: string) => String(data.crops.crops.find((c) => c.id === id)!.apia_codes![0]);
const row = (over: Partial<PrintedPlotRow>): PrintedPlotRow => ({
  code: code('grau'),
  crop_id: null,
  name: 'GRÂU',
  area: '8',
  judet: 'TELEORMAN',
  localitate: 'MĂLDĂENI',
  siruta: '153277',
  bloc_fizic: '286',
  parcel_no: '1a',
  farmer_code: null,
  land_use: 'TA',
  ...over,
});
const stored = (id: string, over: Partial<StoredPlot>): StoredPlot => ({
  id,
  name: null,
  county: 'TR',
  siruta: 153277,
  bloc_fizic: null,
  parcel_no: null,
  lpis_fbid: null,
  land_use: 'TA',
  geometry: null,
  centroid_lat: null,
  centroid_lng: null,
  geometry_source: 'lpis',
  auto_crop_id: null,
  archived_at: null,
  ...over,
});
const square = (x: number) => ({ type: 'Polygon' as const, coordinates: [[[x, 44], [x + 0.01, 44], [x + 0.01, 44.01], [x, 44.01], [x, 44]] as [number, number][]] });

const plots = readPaperPlots(
  [
    row({}),
    row({ code: code('porumb'), name: 'PORUMB', area: '7', bloc_fizic: '293', parcel_no: '2a' }),
    row({ code: '999999', name: 'LUCERNĂ', area: '2', bloc_fizic: null, parcel_no: '3' }),
    row({ area: '', bloc_fizic: '500', parcel_no: '4' }),
  ],
  data,
);
const existing = [stored('p-286', { bloc_fizic: '286', parcel_no: '1a', name: 'La pădure' })];

function show(over: Partial<Parameters<typeof PlotsReview>[0]> = {}) {
  const onSave = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <PlotsReview
      open
      onClose={onClose}
      year={2027}
      plots={plots}
      totalAri={1700}
      existing={existing}
      minOverlap={0.6}
      county="TR"
      cropName={(id) => data.crops.crops.find((c) => c.id === id)!.name_ro}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe('the cerere review sheet', () => {
  it('shows each row with what will happen to it, and the total check', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Parcelele din cererea 2027' })).toBeTruthy();
    expect(screen.getByText(/Am găsit 4 parcele, 17 ha/)).toBeTruthy();
    // 17 ha read (the row without an area doesn't count) against 17 ha printed: no warning.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Aceeași ca înainte')).toBeTruthy();
    expect(screen.getAllByText('Parcelă nouă')).toHaveLength(2);
    expect(screen.getByText('Nu se salvează')).toBeTruthy();
    expect(screen.getByText(/LUCERNĂ, nu e în aplicație · 2 ha/)).toBeTruthy();
    expect(screen.getByText(/Nu am citit blocul fizic/)).toBeTruthy();
    expect(screen.getByText(/Nu am citit suprafața/)).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Salvează Bloc 500 · parcela 4' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('warns when the rows read don\'t add up to the printed total', () => {
    show({ totalAri: 2000 });
    expect(screen.getByRole('status').textContent).toMatch(/Pe cerere scrie 20 ha în total, iar rândurile citite fac 17 ha/);
  });

  it('saves the checked rows, keeping the id of a parcel the farm already has', async () => {
    const { onSave, onClose } = show();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salvează Parcela 3' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Le pun pe hartă (2)' }));
    });
    const [year, inputs] = onSave.mock.calls[0] as unknown as [number, { id?: string; blocFizic: string | null }[]];
    expect(year).toBe(2027);
    expect(inputs.map((i) => i.id ?? i.blocFizic)).toEqual(['p-286', '293']);
    expect(onClose).toHaveBeenCalled();
  });

  it('asks about a parcel whose bloc outline covers one the farm has, and uses the answer', async () => {
    const drawn = [stored('p-old', { bloc_fizic: '777', parcel_no: '9', geometry: square(25) })];
    const one = plots.slice(1, 2);
    const ask = async (answer: RegExp) => {
      const located = { [one[0]!.row]: { status: 'found' as const, placement: { source: 'approx' as const, geometry: square(25), centre: null, fit: 'in_bloc' as const, bloc: null } } };
      const { onSave } = show({ plots: one, existing: drawn, totalAri: null, located });
      expect(screen.getByText('Verifică')).toBeTruthy();
      expect(screen.getByText(/Seamănă cu Bloc 777 · parcela 9/)).toBeTruthy();
      fireEvent.click(screen.getByLabelText(answer));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'O pun pe hartă' }));
      });
      cleanup();
      return (onSave.mock.calls[0] as unknown as [number, { id?: string }[]])[1][0]!.id;
    };
    expect(await ask(/Da, e aceeași/)).toBe('p-old');
    expect(await ask(/Nu, e alta/)).toBeUndefined();
  });

  it('keeps the sheet open and says why when saving fails, and is off without internet', async () => {
    const { onClose } = show({ onSave: vi.fn(async () => Promise.reject(new Error('Nu am putut salva. Încearcă din nou.'))) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Le pun pe hartă (3)' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('Nu am putut salva. Încearcă din nou.');
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
    online = false;
    show();
    expect((screen.getByRole('button', { name: 'Le pun pe hartă (3)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(SAVE_NEEDS_NET)).toBeTruthy();
  });

  it('says where each row was found, and saves the place with the parcel', async () => {
    const bloc = { fbid: '153277-293', siruta: 153277, bloc: '293', county: 'TR', commune: 'MALDAENI', landUse: 'TA', netAreaAri: 719, geometry: square(25) };
    const { onSave } = show({
      located: {
        0: { status: 'looking' },
        1: { status: 'found', placement: { source: 'lpis', geometry: square(25), centre: null, fit: 'whole', bloc } },
        2: { status: 'found', placement: { source: 'approx', geometry: null, centre: [24.9, 44.1], fit: 'in_commune', bloc: null } },
        3: { status: 'failed', offline: false },
      },
    });
    expect(screen.getByText('Caut blocul pe harta APIA…')).toBeTruthy();
    expect(screen.getByText('Pe hartă: blocul fizic 293, cât parcela ta.')).toBeTruthy();
    expect(screen.getByText(/O punem aproximativ, în Măldăeni/)).toBeTruthy();
    // Row 3 can't be saved (no area), so nothing is said about its place.
    expect(screen.queryByText(/Harta APIA nu răspunde/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Le pun pe hartă (3)' }));
    });
    const inputs = (onSave.mock.calls[0] as unknown as [number, { id?: string; geometrySource?: string; centre?: unknown }[]])[1];
    // Row 0 is a parcel the farm has but hasn't placed: it would take the bloc once found.
    expect(inputs.map((i) => [i.id ?? null, i.geometrySource ?? null, i.centre ?? null])).toEqual([
      ['p-286', null, null],
      [null, 'lpis', null],
      [null, 'approx', [24.9, 44.1]],
    ]);
  });

  it('in_bloc says the bloc is bigger and can be drawn later; offline says so', () => {
    const bloc = { fbid: '153277-286', siruta: 153277, bloc: '286', county: 'TR', commune: null, landUse: 'TA', netAreaAri: 854, geometry: square(25) };
    expect(whereText({ status: 'found', placement: { source: 'approx', geometry: square(25), centre: null, fit: 'in_bloc', bloc } }, plots[0]!)).toBe(
      'Pe hartă: undeva în blocul fizic 286, care are 8,54 ha. O poți desena exact după ce salvezi.',
    );
    expect(whereText({ status: 'failed', offline: true }, plots[0]!)).toMatch(/^Fără internet/);
    expect(whereText(undefined, plots[0]!)).toBeNull();
  });

  it('titles a parcel by its name, else bloc and number', () => {
    expect(plotTitle({ name: 'La pădure', bloc_fizic: '1' })).toBe('La pădure');
    expect(plotTitle({ blocFizic: '286', parcelNo: '1a' })).toBe('Bloc 286 · parcela 1a');
    expect(plotTitle({ blocFizic: null, parcelNo: null }, 4)).toBe('Rândul 5');
  });
});
