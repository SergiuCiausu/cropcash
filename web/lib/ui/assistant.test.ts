import { describe, expect, it } from 'vitest';
import { card, withClientId } from './assistant';

/* The card the assistant draws for add_event: the exact values that will be saved. */
describe('the add_event card', () => {
  const crop = (id: string) => ({ grau: 'Grâu' })[id] ?? id;

  it('shows a monthly rate with its sum, its end and the reminder', () => {
    const c = card(
      { function: 'add_event', input: { category: 'money', title: 'Rata la bancă', startsOn: '2027-04-15', repeat: 'monthly', repeatUntil: '2027-12-15', direction: 'out', amountLei: 1500, expenseCategory: 'other', remindDaysBefore: 3 } },
      crop,
    );
    expect(c.title).toBe('Pun în calendar');
    expect(Object.fromEntries(c.rows)).toMatchObject({
      Ce: 'Rata la bancă',
      'Prima dată': '15 aprilie 2027',
      Plătești: '1.500 lei',
      'Se repetă': 'În fiecare lună, până pe 15 decembrie 2027',
      'Îți amintesc': 'Cu 3 zile înainte',
    });
  });

  it('shows a visit with no sum, on one day, with its crop', () => {
    const c = card({ function: 'add_event', input: { category: 'crop', title: 'Verific cultura', startsOn: '2027-05-02', repeat: 'none', cropId: 'grau' } }, crop);
    expect(c.rows).toEqual([
      ['Ce', 'Verific cultura'],
      ['Ziua', '2 mai 2027'],
      ['Cultura', 'Grâu'],
    ]);
  });

  it('gets its own id, so a second tap can’t add it twice', () => {
    const a = withClientId({ function: 'add_event', input: { title: 'x' } }, () => 'id-1');
    expect(a.input.clientId).toBe('id-1');
  });
});

describe('the contract cards (contracts step 9)', () => {
  const name = (id: string) => (id === 'c1' ? 'Asigurare · Groupama' : null);
  it('„Am hotărât” names the contract and the decision in words', () => {
    const c = card({ function: 'decide_contract', input: { id: 'c1', source: 'contract', decision: 'renew', decidedOn: '2026-11-15' } }, (id) => id, undefined, name);
    expect(c.title).toBe('Notez ce ai hotărât');
    expect(c.rows).toEqual([
      ['Contractul', 'Asigurare · Groupama'],
      ['Ai hotărât', 'Îl reînnoiesc'],
      ['Pe', '15 noiembrie 2026'],
    ]);
    const back = card({ function: 'decide_contract', input: { id: 'c1', source: 'contract', decision: null, decidedOn: '2026-11-15' } }, (id) => id, undefined, name);
    expect(back.rows[1]).toEqual(['Ai hotărât', 'Scot hotărârea']);
  });

  it('archiving shows the contract, never a bare id', () => {
    expect(card({ function: 'archive_contract', input: { id: 'c1' } }, (id) => id, undefined, name).rows).toEqual([['Contractul', 'Asigurare · Groupama']]);
    expect(card({ function: 'archive_contract', input: { id: 'zz' } }, (id) => id, undefined, name).rows).toEqual([['Contractul', 'Contractul']]);
  });
});
