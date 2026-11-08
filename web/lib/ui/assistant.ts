/* "Întreabă" (docs/functions.md §14, plan steps 9c–9d), the parts that don't touch the page:
   the reply's text as blocks, and what a confirm card shows. From web/legacy/assistant.js. */
import { exact } from '../cc/format';

export const MAX_TURNS = 20;
export const NO_NET = 'Pornește internetul ca să întrebi.';
export const EXAMPLES = ['Cât pot să-mi iau salariu pe lună?', 'Pot să-mi iau o drujbă de 2.000 de lei în martie?', 'Am cheltuit azi 300 de lei pe motorină.', 'Ce termene am luna asta?'];
export const ERRORS: Record<string, string> = {
  assistant_unavailable: 'Asistentul nu e pornit pe server.',
  daily_limit: 'Ai pus multe întrebări azi. Mai încearcă mâine.',
  no_farm: 'Completează întâi ferma, apoi poți întreba.',
};

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/** A piece of a line: plain text, or **bold**. */
export type Span = { text: string; bold: boolean };
export type Block = { kind: 'p'; spans: Span[] } | { kind: 'ul'; items: Span[][] };

const spans = (line: string): Span[] =>
  line
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((part) => (/^\*\*.+\*\*$/.test(part) ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));

/** Plain text with **bold** and "- " lists. React escapes the text, so nothing here is HTML. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split('\n')) {
    const item = /^\s*[-•]\s+(.*)$/.exec(line);
    if (item) {
      const last = out[out.length - 1];
      if (last?.kind === 'ul') last.items.push(spans(item[1]));
      else out.push({ kind: 'ul', items: [spans(item[1])] });
      continue;
    }
    if (line.trim()) out.push({ kind: 'p', spans: spans(line) });
  }
  return out;
}

const CATEGORIES: Record<string, string> = { seeds: 'Sămânță', fertilizer: 'Îngrășăminte', treatments: 'Tratamente', diesel: 'Motorină', field_work: 'Lucrări', repairs: 'Reparații', rent: 'Arendă', other: 'Altele' };
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const lei = (n: number) => `${exact(Math.round(n * 100))} lei`;
const day = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};
const month = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTHS[+m - 1]} ${y}`;
};
const comma = (v: unknown) => String(v).replace('.', ',');

export interface Action {
  function: string;
  input: Record<string, unknown>;
}

/** What a card says: the exact values that will be saved. `task` is a task id whose title can be looked up. */
export function card(action: Action, cropName: (id: string) => string): { title: string; rows: [string, string][]; task?: string } {
  const i = action.input as Record<string, string & number>;
  switch (action.function) {
    case 'add_expense':
      return { title: 'Notez o cheltuială', rows: [['Pe ce', CATEGORIES[i.category] || i.category], ['Suma', lei(i.amountLei)], ['Data', day(i.date)], ...(i.cropId ? [['Cultura', cropName(i.cropId)] as [string, string]] : []), ...(i.note ? [['Notă', i.note] as [string, string]] : [])] };
    case 'record_sale':
      return {
        title: 'Notez o vânzare',
        rows: [
          ['Cultura', cropName(i.cropId)],
          ...(i.totalLei !== undefined ? [['Suma', lei(i.totalLei)] as [string, string]] : [['Cantitatea', `${comma(i.tonnes)} tone`] as [string, string], ['Prețul', `${comma(i.pricePerKgLei)} lei/kg`] as [string, string]]),
          ['Data', day(i.date)],
          ...(i.note ? [['Notă', i.note] as [string, string]] : []),
        ],
      };
    case 'add_credit':
      return { title: 'Notez un credit', rows: [['Suma', lei(i.amountLei)], ['Îl iei în', month(i.takeMonth)], ['Îl dai înapoi în', month(i.repayMonth)]] };
    case 'complete_task':
      return { title: 'Bifez un termen ca făcut', rows: [['Termenul', i.id]], task: i.id };
    case 'reopen_task':
      return { title: 'Scot bifa de la un termen', rows: [['Termenul', i.id]], task: i.id };
    case 'follow_opportunity':
      return { title: 'Pun un apel de finanțare în calendar', rows: Object.entries(i).map(([k, v]) => [k, String(v)]) };
    default:
      return { title: 'Salvez', rows: Object.entries(i).map(([k, v]) => [k, String(v)]) };
  }
}

/** The card's own id: a second tap after an error can't save the sale, expense or credit twice. */
export function withClientId(action: Action, id: () => string): Action {
  if (action.function === 'record_sale' || action.function === 'add_expense') return { ...action, input: { ...action.input, clientId: id() } };
  if (action.function === 'add_credit') return { ...action, input: { ...action.input, groupId: id() } };
  return action;
}
