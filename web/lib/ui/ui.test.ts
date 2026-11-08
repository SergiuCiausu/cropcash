import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { memoryStore } from '../cc/storage';
import { readFarmState } from '../cc/farm';
import { farmView } from '../cc/plan';
import { SCREENS } from '../../screens';
import { blocks, card, withClientId } from './assistant';
import { chartRows, otherYears, yearEnds } from './chart';
import { buildMessage, MESSAGES, panelRows, type MessageInput } from './messages';
import { REACT_PAGES, sectionOf, TABS } from './nav';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
const ion = () => farmView(readFarmState('demo', memoryStore(), data, NOW), 'farm');

describe('navigation', () => {
  it('puts each page under its tab', () => {
    expect(sectionOf('/oportunitati')).toBe('/subventii');
    expect(sectionOf('/surse')).toBe('/subventii');
    expect(sectionOf('/bani')).toBe('/salariu');
    expect(sectionOf('/date-plan')).toBe('/salariu');
    expect(sectionOf('/calendar')).toBe('/calendar');
    // On a phone these sit under "Mai mult"; the bar keeps Acasă, Subvenții, Recolte and Salariu.
    expect(TABS.filter((t) => t.railOnly).map((t) => t.path)).toEqual(['/calendar', '/prognoza', '/pensie']);
    expect(TABS.filter((t) => !t.railOnly).map((t) => t.path)).toEqual(['/acasa', '/subventii', '/recolte', '/salariu']);
  });

  it('lists exactly the screens drawn by React', () => {
    const react = Object.entries(SCREENS)
      .filter(([, s]) => 'App' in s && s.App)
      .map(([n]) => `/${n}`);
    expect([...REACT_PAGES].sort()).toEqual(react.sort());
  });
});

describe('assistant text and cards', () => {
  it('turns bold and lists into blocks, never HTML', () => {
    expect(blocks('Ai **2.000 lei**.\n- unu\n- <b>doi</b>\n\nGata')).toEqual([
      { kind: 'p', spans: [{ text: 'Ai ', bold: false }, { text: '2.000 lei', bold: true }, { text: '.', bold: false }] },
      { kind: 'ul', items: [[{ text: 'unu', bold: false }], [{ text: '<b>doi</b>', bold: false }]] },
      { kind: 'p', spans: [{ text: 'Gata', bold: false }] },
    ]);
  });

  it('shows the exact values that will be saved', () => {
    const c = card({ function: 'add_expense', input: { category: 'diesel', amountLei: 300, date: '2026-11-15', cropId: 'grau' } }, () => 'Grâu');
    expect(c.title).toBe('Notez o cheltuială');
    expect(c.rows).toEqual([
      ['Pe ce', 'Motorină'],
      ['Suma', '300 lei'],
      ['Data', '15 noiembrie 2026'],
      ['Cultura', 'Grâu'],
    ]);
    expect(card({ function: 'complete_task', input: { id: 'apia-2027' } }, String).task).toBe('apia-2027');
  });

  it('gives sales and expenses one id per card', () => {
    expect(withClientId({ function: 'record_sale', input: { cropId: 'grau' } }, () => 'x').input.clientId).toBe('x');
    expect(withClientId({ function: 'add_credit', input: {} }, () => 'x').input.clientId).toBeUndefined();
  });
});

describe('chart', () => {
  it('has a row per month with all three years', () => {
    const plan = ion().farmPlan();
    const rows = chartRows(plan, 'medium');
    expect(rows).toHaveLength(plan.timelines.medium.months.length);
    expect(rows[0].v).toBe(rows[0].medium);
    expect(rows[0].long).toMatch(/^[a-z]+ \d{4}$/);
    const others = otherYears(rows, 'medium');
    expect(others.sort()).toEqual(['bad', 'good']);
    expect(yearEnds(rows, 'medium', (b) => `${b}`)).toMatch(/^An (slab|bun): -?\d+, An (slab|bun): -?\d+$/);
  });
});

describe('notifications', () => {
  const input = (): MessageInput => {
    const v = ion();
    return { plan: v.farmPlan(), data: v.data(), today: v.today, doneTasks: new Set(), calls: [], changes: [], href: (p) => `/ferma-lui-ion${p}` };
  };

  it("builds Ion's messages from his plan, with links in his farm", () => {
    const weekly = buildMessage('weekly', input())!;
    expect(weekly.title).toMatch(/^Săptămâna asta/);
    expect(weekly.action?.href).toBe('/ferma-lui-ion/calendar');
    expect(buildMessage('payout', input())?.tone).toBe('urgent');
  });

  it('has nothing official to say before a change is seen', () => {
    expect(buildMessage('funding', input())).toBeNull();
    expect(buildMessage('funding', { ...input(), changes: [{ institution: 'APIA', title: 'Ghid nou', date: '2026-11-10' }] })?.body).toBe('APIA: Ghid nou, pe 10 nov. 2026.');
  });

  it('turns off plan messages for a finished harvest', () => {
    const rows = panelRows({ ...input(), plan: null });
    expect(rows).toHaveLength(MESSAGES.length);
    expect(rows.filter((r) => r.ok).map((r) => r.kind)).toEqual(['payout']);
    expect(rows.find((r) => r.kind === 'weekly')?.sub).toBe('Alege o recoltă deschisă.');
  });
});
