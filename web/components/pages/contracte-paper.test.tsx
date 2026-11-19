// @vitest-environment happy-dom
/* Contracte, „Citește-l din poză” (docs/contracts-plan.md step 8): the paper fills the form, every field read waits for
   „E bine”, and nothing is saved before the farmer adds it. An arendă paper goes to Arendă. */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractPaperReading } from '../../../packages/shared/src/contracts/paper';
import { ME, showPage, SIGNED_IN } from './harness';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const pdf = new File(['%PDF-1.4 contract'], 'contract.pdf', { type: 'application/pdf' });
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal('scrollTo', () => undefined);
  localStorage.clear();
  // The phone's file picker: hands back one PDF.
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    if (this.type !== 'file') return;
    Object.defineProperty(this, 'files', { value: [pdf], configurable: true });
    setTimeout(() => this.dispatchEvent(new Event('change')), 0);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sale: ContractPaperReading = {
  kind: 'sale',
  title: 'Vânzare grâu 2027',
  number: '112',
  signedOn: '2027-03-01',
  startsOn: '2027-03-01',
  endsOn: '2027-08-31',
  autoRenews: null,
  noticeDays: null,
  renewMonths: null,
  sides: [
    { role: 'vânzător', name: 'Maria Ionescu', cui: null, kind: 'person' },
    { role: 'cumpărător', name: 'Cereale Câmpia SRL', cui: 'RO12345678', kind: 'company' },
  ],
  cropId: 'grau',
  quantityKg: 200_000,
  areaAri: null,
  vatBp: null,
  residualBani: null,
  payments: [{ label: 'Avans', payerRole: 'cumpărător', firstOn: '2027-03-01', repeat: 'none', times: null, amountBani: 4_200_000, perHa: false, kg: null, cropId: null }],
};

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await act(async () => new Promise((r) => setTimeout(r, 5)));
};

async function readPaper(reading: object) {
  const page = await showPage('contracte', 'farm', SIGNED_IN, true, ME);
  (page.live.write as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => (name === 'read_contract_paper' ? reading : name === 'add_party' ? { id: 'p-new' } : {}));
  await click('Adaugă un contract');
  await click('Citește-l din poză');
  await click('Bine așa');
  await waitFor(() => expect(writes(page.live)).toContain('read_contract_paper'));
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  return page;
}
const writes = (live: { write: unknown }) => (live.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);

describe('Contracte, „Citește-l din poză”', () => {
  it('fills the form; the farmer checks every field before it is added', async () => {
    const { live } = await readPaper(sale);
    expect(writes(live)).toEqual(['read_contract_paper']);
    // Which side is the farm decides who pays.
    await click(/Vânzător/);
    expect((screen.getByDisplayValue('Cereale Câmpia SRL') as HTMLInputElement).value).toBe('Cereale Câmpia SRL');
    expect(screen.getByDisplayValue('42000')).toBeTruthy();
    const marked = screen.getAllByRole('button', { name: 'E bine' }).length;
    expect(marked).toBeGreaterThan(3);

    await click('Adaugă contractul');
    expect(document.body.textContent).toContain('Verifică ce am citit din poză');
    expect(writes(live)).toEqual(['read_contract_paper']);

    while (screen.queryAllByRole('button', { name: 'E bine' }).length)
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'E bine' })[0]!);
      });
    await click('Adaugă contractul');
    expect(writes(live)).toEqual(['read_contract_paper', 'add_party', 'add_contract']);
    const added = (live.write as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'add_contract')![1];
    expect(added).toMatchObject({ kind: 'sale', partyId: 'p-new', startsOn: '2027-03-01', endsOn: '2027-08-31', cropId: 'grau', quantityKg: 200_000 });
    expect(added.payments[0]).toMatchObject({ direction: 'in', amountLei: 42_000 });
  });

  it('changing a field counts as checking it', async () => {
    await readPaper({ ...sale, sides: [sale.sides[1]], payments: [] });
    const before = screen.getAllByRole('button', { name: 'E bine' }).length;
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Cereale Câmpia SRL'), { target: { value: 'Cereale Câmpia' } });
    });
    expect(screen.getAllByRole('button', { name: 'E bine' }).length).toBe(before - 1);
  });

  it('an arendă paper goes to Arendă, and a paper that isn’t a contract says so; nothing saved', async () => {
    const a = await readPaper({ ...sale, kind: 'arenda' });
    expect(document.body.textContent).toContain('E un contract de arendă');
    expect(writes(a.live)).toEqual(['read_contract_paper']);
    cleanup();
    localStorage.clear();
    const b = await readPaper({ ...sale, kind: null });
    expect(document.body.textContent).toContain('Nu pare un contract');
    expect(writes(b.live)).toEqual(['read_contract_paper']);
  });
});
