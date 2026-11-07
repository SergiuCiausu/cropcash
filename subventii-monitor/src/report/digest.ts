// The farmer-focused section at the top of the daily report, in Romanian.
// Closing deadlines appear even on days when no source changed.
import type { Opportunity, OpportunityEvent, Relevance } from '../opportunities/types.ts';

const MAX_ITEMS = 30;

const LABELS: Record<Relevance, string> = {
  direct: 'depunere directă',
  conditional: 'cu condiții',
  partnership: 'prin parteneriat',
  not_relevant: 'nerelevant',
};
const ORDER: Relevance[] = ['direct', 'conditional', 'partnership', 'not_relevant'];
const FIELD_NAMES: Record<string, string> = {
  deadline: 'Termen',
  openDate: 'Data deschiderii',
  budgetEur: 'Buget',
  title: 'Titlu',
};

export interface DigestInput {
  today: string;
  opportunities: Opportunity[];
  events: OpportunityEvent[];
}

function romanianDate(date: string | null): string {
  if (!date) return 'nepublicat';
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

function money(value: number | null): string {
  if (value === null) return 'nepublicat';
  return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} EUR`;
}

function item(o: Opportunity): string {
  const flag = o.confidence === 'low' ? ' **(verifică)**' : '';
  const note = o.relevanceNote ? ` ${o.relevanceNote}` : '';
  return `- [${o.title.replaceAll(']', ')')}](${o.url}) (${o.programme}, ${LABELS[o.relevance]})${flag}: termen ${romanianDate(o.deadline)}, buget ${money(o.budgetEur)}.${note}`;
}

function byImportance(a: Opportunity, b: Opportunity): number {
  return ORDER.indexOf(a.relevance) - ORDER.indexOf(b.relevance) || (a.deadline ?? '9').localeCompare(b.deadline ?? '9');
}

function section(title: string, rows: Opportunity[]): string[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort(byImportance);
  const hidden = sorted.length - MAX_ITEMS;
  return [
    `### ${title} (${rows.length})`, '',
    ...sorted.slice(0, MAX_ITEMS).map(item),
    ...(hidden > 0 ? [`- și încă ${hidden}, mai puțin prioritare.`] : []),
    '',
  ];
}

function plusDays(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatValue(field: string, value: string | null): string {
  if (field === 'deadline' || field === 'openDate') return romanianDate(value);
  if (field === 'budgetEur') return money(value === null ? null : Number(value));
  return value ?? 'nepublicat';
}

export function renderDigest({ today, opportunities, events }: DigestInput): string[] {
  // Leaving the list before its deadline can mean the budget ran out. Calls that
  // simply reached their deadline aren't news.
  const isRemoved = new Set(events.filter((e) => e.field === 'removed').map((e) => e.stableKey));
  const removed = opportunities.filter((o) => (
    isRemoved.has(o.stableKey) && o.relevance !== 'not_relevant' && (o.deadline === null || o.deadline >= today)
  ));

  const useful = opportunities.filter((o) => o.relevance !== 'not_relevant');
  const byKey = new Map(useful.map((o) => [o.stableKey, o]));

  const isNew = new Set(events.filter((e) => e.field === 'new').map((e) => e.stableKey));
  const added = useful.filter((o) => isNew.has(o.stableKey));

  const changes: string[] = [];
  for (const e of events) {
    const label = FIELD_NAMES[e.field];
    const o = byKey.get(e.stableKey);
    if (label && o) {
      changes.push(`- [${o.title.replaceAll(']', ')')}](${o.url}): ${label.toLowerCase()} ${formatValue(e.field, e.oldValue)} → ${formatValue(e.field, e.newValue)}.`);
    }
  }

  const live = useful.filter((o) => o.status !== 'closed' && o.deadline !== null && o.deadline >= today);
  const week = plusDays(today, 7);
  const month = plusDays(today, 30);
  const closingWeek = live.filter((o) => o.deadline! <= week);
  const closingMonth = live.filter((o) => o.deadline! > week && o.deadline! <= month);

  const body = [
    ...section('Oportunități noi', added),
    ...(changes.length > 0 ? [`### Termene sau bugete modificate (${changes.length})`, '', ...changes, ''] : []),
    ...section('Scoase din listă înainte de termen', removed),
    ...section('Se închid în 7 zile', closingWeek),
    ...section('Se închid în 30 de zile', closingMonth),
  ];
  if (body.length === 0) return [];

  return [
    '## Oportunități pentru fermieri', '',
    'Etichetele sunt orientative. Confirmă termenele și eligibilitatea la sursa oficială.', '',
    ...body,
  ];
}
