// @vitest-environment happy-dom
/* A save says it saved, and a delete can be taken back (F-13, F-20). */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { salaryEffectText } from '../../lib/ui/messages';
import { ME, showPage, SIGNED_IN } from '../pages/harness';

beforeAll(() => import('recharts'), 120_000);

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('salaryEffectText', () => {
  it('names the new salary and the old one', () => expect(salaryEffectText(300_000, 350_000)).toBe('Salariul tău e acum 3.500 lei pe lună, de la 3.000 lei.'));
  it('says when nothing changed', () => expect(salaryEffectText(300_000, 300_000)).toBe('Salariul rămâne 3.000 lei pe lună.'));
  it('says nothing without a plan', () => {
    expect(salaryEffectText(null, 300_000)).toBe('');
    expect(salaryEffectText(300_000, null)).toBe('');
  });
});

const flush = async () => {
  await act(async () => undefined);
  await act(async () => undefined);
};
const noteSale = async (online: boolean) => {
  await showPage('recolte', 'farm', SIGNED_IN, online);
  const form = document.querySelector('form.h-record')!;
  fireEvent.change(form.querySelector('input[inputmode="numeric"]')!, { target: { value: '12 500' } });
  await act(async () => {
    fireEvent.submit(form);
  });
  await flush();
};

describe('Noting a sale', () => {
  it('says so, with the salary', async () => {
    await noteSale(true);
    expect(screen.getByText('Am notat vânzarea')).toBeTruthy();
    expect(screen.getByText(/^Salariul (tău e acum|rămâne) /)).toBeTruthy();
  });

  it('says it waits for internet when offline', async () => {
    await noteSale(false);
    expect(screen.getByText('Se trimite când ai internet.')).toBeTruthy();
  });
});

describe('Deleting a record', () => {
  const sale = { id: 't1', kind: 'sale', crop_id: 'grau', amount_bani: 1_250_000, occurred_at: '2026-11-10T12:00:00Z', source: 'manual' };
  const me = { ...ME, transactions: [sale] };
  const open = async () => {
    const page = await showPage('recolte', 'farm', { ...SIGNED_IN, 'cropcash-me': JSON.stringify(me) }, true, me);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Șterge / }));
    });
    return page;
  };
  const deletes = (write: unknown) => (write as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'undo_transaction');

  it('hides the row and sends nothing at first', async () => {
    const { live } = await open();
    expect(screen.queryByRole('button', { name: /^Șterge / })).toBeNull();
    expect(deletes(live.write)).toHaveLength(0);
  });

  it('brings the row back on Anulează, and never sends', async () => {
    const { live } = await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    });
    expect(screen.getByRole('button', { name: /^Șterge / })).toBeTruthy();
    await flush();
    expect(deletes(live.write)).toHaveLength(0);
  });

  it('deletes once when the message goes', async () => {
    const { live } = await open();
    await act(async () => {
      fireEvent.click(document.querySelector('.ntf .ntf-x')!);
    });
    await flush();
    expect(deletes(live.write)).toHaveLength(1);
    expect(deletes(live.write)[0][1]).toEqual({ id: 't1' });
  });

  it('deletes when the page goes first', async () => {
    const { live } = await open();
    await act(async () => cleanup());
    await flush();
    expect(deletes(live.write)).toHaveLength(1);
  });
});
