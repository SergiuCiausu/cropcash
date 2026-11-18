/* The in-app notifications, built from the farm's own plan, so they work offline
   (web/legacy/notifications.js). Web Push and the server jobs are plan step 9f. Each message is the
   same { kind, tone, title, body, action } object the "Mesaje" card can take later. */
import type { AppData } from '../../../packages/shared/src/data/index';
import { maxSafeSalary } from '../../../packages/shared/src/cashflow/smoothing';
import type { FarmPlan } from '../../../packages/shared/src/functions/plan';
import { date, daysLeft, exact, zile } from '../cc/format';

export type Tone = 'info' | 'good' | 'warn' | 'urgent';

export interface Message {
  kind: string;
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; href: string };
}

/** What a toast can take: a link, or a button that acts here, and what to do when it goes unused. */
export type ToastInput = Omit<Message, 'kind' | 'action'> & {
  kind?: string;
  action?: Message['action'] | { label: string; run: () => void };
  onExpire?: () => void;
};

/** What a save did to the monthly salary. Empty when there's no plan to compare. */
export function salaryEffectText(beforeBani: number | null, afterBani: number | null): string {
  if (beforeBani === null || afterBani === null) return '';
  if (beforeBani === afterBani) return `Salariul rămâne ${exact(afterBani)} lei pe lună.`;
  return `Salariul tău e acum ${exact(afterBani)} lei pe lună, de la ${exact(beforeBani)} lei.`;
}

export interface MessageInput {
  /** Null when a finished harvest is picked: there's no plan to read. */
  plan: FarmPlan | null;
  data: AppData;
  today: string;
  doneTasks: Set<string>;
  /** Followed calls with a deadline, already named for the farmer. */
  calls: { title: string; deadline: string | null }[];
  /** The newest real changes on official pages, newest first. */
  changes: { institution?: string; title?: string; date?: string }[];
  /** A link inside the mode the visitor is in (lib/paths.ts appHref). */
  href: (path: string) => string;
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthWord = (key: string) => MONTHS[+key.split('-')[1] - 1];

type Build = (m: Required<Pick<MessageInput, 'data' | 'today' | 'doneTasks' | 'calls' | 'changes' | 'href'>> & { plan: FarmPlan }) => Omit<Message, 'kind'> | null;

const entries = (plan: FarmPlan) => plan.timelines.medium.months.flatMap((m) => m.entries);

/** Same task id as the calendar, so a task ticked there isn't reminded here. */
function deadlines({ plan, data, today, doneTasks, calls }: Parameters<Build>[0]) {
  const titles = new Map(data.calendar.events.map((e) => [e.id, e.title_ro]));
  const fromPlan = entries(plan)
    .filter((e) => e.kind === 'deadline' && !doneTasks.has(`${e.eventId}:${(e.window?.end ?? e.date).slice(0, 4)}`))
    .map((e) => ({ title: titles.get(e.eventId ?? '') ?? '', date: e.date }));
  const fromCalls = calls.filter((c) => c.deadline).map((c) => ({ title: c.title, date: c.deadline! }));
  return [...fromPlan, ...fromCalls].filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

const weekly: Build = (m) => {
  const week = (iso: string) => iso >= m.today && daysLeft(iso, m.today) <= 7;
  const coming = entries(m.plan).filter((e) => e.kind.startsWith('apia') && e.value && week(e.date)).reduce((s, e) => s + e.value, 0);
  const dates = deadlines(m);
  const due = dates.filter((d) => daysLeft(d.date, m.today) <= 7).length;
  const action = { label: 'Vezi calendarul', href: m.href('/calendar') };
  if (!due && !coming) {
    const next = dates[0];
    return { tone: 'info', title: 'Săptămâna asta n-ai nimic de făcut', body: next ? `Urmează pe ${date(next.date)}: ${next.title}.` : '', action };
  }
  const parts = [due ? (due === 1 ? 'un termen' : `${due} termene`) : '', coming ? `intră ${exact(coming)} lei` : ''].filter(Boolean);
  const first = dates[0];
  return { tone: 'info', title: `Săptămâna asta: ${parts.join(', ')}`, body: first && daysLeft(first.date, m.today) <= 7 ? `${first.title}, pe ${date(first.date)}.` : '', action };
};

const spring: Build = ({ plan, href }) => {
  const s = plan.spring;
  const low = plan.timelines.medium.lowest;
  const action = { label: 'Vezi prognoza', href: href('/prognoza') };
  if (!s.firstMonth) return { tone: 'info', title: 'Nu vezi luni grele în plan', body: 'Banii îți ajung tot anul.', action };
  const stretch = s.firstMonth === s.lastMonth ? `În ${monthWord(s.firstMonth)}` : `Din ${monthWord(s.firstMonth)} până în ${monthWord(s.lastMonth!)}`;
  const end = low.balance < 0 ? `Îți lipsesc ${exact(-low.balance)} lei în ${monthWord(low.key)}.` : `Cel mai jos ajungi la ${exact(low.balance)} lei, în ${monthWord(low.key)}.`;
  return { tone: 'warn', title: 'Primăvara vine greu', body: `${stretch} ies ${exact(s.need)} lei. ${end}`, action };
};

const deadline: Build = (m) => {
  const next = deadlines(m)[0];
  if (!next) return null;
  const d = daysLeft(next.date, m.today);
  return { tone: 'warn', title: d === 0 ? 'Termen azi' : `Mai ai ${zile(d)}`, body: `${next.title}, până pe ${date(next.date, true)}.`, action: { label: 'Vezi calendarul', href: m.href('/calendar') } };
};

/** The salary a bad year allows, which is what the plan falls back to when a payment comes in low. */
const salaryDown: Build = ({ plan, data, href }) => {
  const lower = maxSafeSalary(plan.timelines.bad, plan.smoothing, data).salary;
  const before = plan.salary.salary;
  if (lower >= before) return null;
  const until = monthWord(plan.timelines.bad.lowest.key);
  const action = { label: 'Vezi salariul', href: href('/salariu') };
  if (lower === 0) return { tone: 'urgent', title: 'Am oprit salariul deocamdată', body: `Cu mai puțini bani de la APIA, nu-ți ajung până în ${until}. Înainte era ${exact(before)} lei.`, action };
  return { tone: 'urgent', title: `Am scăzut salariul la ${exact(lower)} lei`, body: `Ca să-ți ajungă până în ${until}. Înainte era ${exact(before)} lei.`, action };
};

/** The newest real change on an official page. With none seen yet, there's no message. */
const funding: Build = ({ changes, href }) => {
  const c = changes[0];
  if (!c) return null;
  return { tone: 'info', title: 'Noutate de la o sursă urmărită', body: `${c.institution}: ${c.title}, pe ${date(c.date ?? '', true)}.`, action: { label: 'Vezi ce s-a schimbat', href: href('/surse') } };
};

const money: Build = ({ plan, href }) => {
  const e = entries(plan).find((x) => x.kind === 'apia_advance' || x.kind === 'apia_balance');
  if (!e) return null;
  return { tone: 'good', title: `Au intrat ${exact(e.value)} lei de la APIA`, body: 'Îți propunem cum să-i împarți.', action: { label: 'Vezi salariul', href: href('/salariu') } };
};

const payoutFailed: Build = ({ href }) => ({ tone: 'urgent', title: 'Plata salariului n-a mers', body: 'Verifică datele contului.', action: { label: 'Vezi salariul', href: href('/salariu') } });

/** [kind, name in the panel, builder, needs a plan]. */
export const MESSAGES: [string, string, Build, boolean][] = [
  ['weekly', 'Rezumatul de duminică', weekly, true],
  ['spring', 'Avertizarea de primăvară', spring, true],
  ['deadline', 'Termen aproape', deadline, true],
  ['salary', 'Salariu mai mic', salaryDown, true],
  ['funding', 'Noutate oficială', funding, false],
  ['money', 'Au intrat bani', money, true],
  ['payout', 'Plată eșuată', payoutFailed, false],
];

/** What a real farmer's "Mesaje" can truthfully say: only what the plan knows, never a payment it didn't see. */
const INBOX = ['deadline', 'spring', 'weekly', 'funding'];

export function inboxMessages(input: MessageInput): Message[] {
  return INBOX.flatMap((kind) => {
    try {
      return buildMessage(kind, input) ?? [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
}

export const TONE_WORD: Record<Tone, string> = { info: 'Informare', good: 'Veste bună', warn: 'Atenție', urgent: 'Rămâne până o închizi' };

/** One message, or null when there's nothing to say right now. */
export function buildMessage(kind: string, input: MessageInput): Message | null {
  const found = MESSAGES.find(([k]) => k === kind);
  if (!found) return null;
  const [, , build, needsPlan] = found;
  if (needsPlan && !input.plan) return null;
  const n = build({ ...input, plan: input.plan as FarmPlan });
  return n ? { kind, ...n } : null;
}

/** The rows of the demo panel: each message, whether it can be sent now, and why not. */
export function panelRows(input: MessageInput) {
  return MESSAGES.map(([kind, name, , needsPlan]) => {
    if (needsPlan && !input.plan) return { kind, name, sub: 'Alege o recoltă deschisă.', ok: false };
    let n: Message | null = null;
    try {
      n = buildMessage(kind, input);
    } catch (e) {
      console.error(e);
    }
    return n ? { kind, name, sub: TONE_WORD[n.tone], ok: true } : { kind, name, sub: 'Nimic de trimis acum.', ok: false };
  });
}
