// The daily Markdown report, in Romanian to match the spec. Built only from a
// run's saved events, so it can be regenerated at any time.
import { PROBLEM_STATES, type ProblemSource, type ProblemState, type RunEvent } from '../store.ts';

const MAX_DIFF_LINES = 200;

const PROBLEM_LABELS: Record<ProblemState, string> = {
  gone: 'Dispărute',
  blocked: 'Blocate',
  error: 'Cu erori',
  suspicious: 'Suspecte',
  needs_manual: 'De verificat manual',
};

export interface ReportInput {
  date: string;
  checked: number;
  requests: number;
  bytes: number;
  pendingLinks: number;
  events: RunEvent[];
  /** The farmer digest, already rendered. It leads the report. */
  digest?: string[];
  /** Problems that belong to the run rather than to one source. */
  errors?: string[];
  /** Every source with a problem today, including older ones. */
  problems?: ProblemSource[];
}

export interface NewLinkDetail {
  url: string;
  text: string;
  score: number;
  isDocument: boolean;
  versionOf: string | null;
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function sourceLink(e: RunEvent): string {
  return `[${e.title.replaceAll(']', ')')}](${e.url})`;
}

function list(title: string, events: RunEvent[]): string[] {
  if (events.length === 0) return [];
  const lines = events.map((e) => `- ${e.institution}: ${sourceLink(e)}${e.detail ? ` – ${e.detail}` : ''}`);
  return [`## ${title} (${events.length})`, '', ...lines, ''];
}

function newLinks(events: RunEvent[]): string[] {
  if (events.length === 0) return [];
  const rows = events
    .map((e) => ({ event: e, link: JSON.parse(e.detail ?? '{}') as NewLinkDetail }))
    .sort((a, b) => Number(b.link.isDocument) - Number(a.link.isDocument) || b.link.score - a.link.score);

  const lines = rows.map(({ event, link }) => {
    const name = link.text || link.url.split('/').pop() || link.url;
    const notes = [
      link.isDocument ? 'document' : 'pagină',
      link.score > 0 ? `relevanță ${link.score}` : null,
      link.versionOf ? `versiune nouă a ${link.versionOf}` : null,
    ].filter(Boolean).join(', ');
    return `- ${event.institution}: [${name.replaceAll(']', ')')}](${link.url}) (${notes}), pe ${sourceLink(event)}`;
  });
  return [`## Linkuri noi (${rows.length})`, '', ...lines, ''];
}

function changed(events: RunEvent[]): string[] {
  if (events.length === 0) return [];
  const out = [`## Surse modificate (${events.length})`, ''];
  for (const e of events) {
    out.push(`### ${e.institution}: ${sourceLink(e)}`, '');
    if (!e.diff) {
      out.push(e.detail ?? 'Diff indisponibil.', '');
      continue;
    }
    const lines = e.diff.split('\n');
    out.push('```diff', ...lines.slice(0, MAX_DIFF_LINES), '```', '');
    if (lines.length > MAX_DIFF_LINES) {
      out.push(`Diff scurtat: se afișează ${MAX_DIFF_LINES} din ${lines.length} de rânduri.`, '');
    }
  }
  return out;
}

/** Always at the end, and separate from what changed: an old problem isn't news. */
function health(problems: ProblemSource[]): string[] {
  if (problems.length === 0) return [];
  const out = [`## Starea surselor (${problems.length} cu probleme)`, ''];
  for (const state of PROBLEM_STATES) {
    const rows = problems.filter((p) => p.state === state);
    if (rows.length === 0) continue;
    out.push(`### ${PROBLEM_LABELS[state]} (${rows.length})`, '');
    for (const p of rows) {
      const reason = p.reason ? ` – ${p.reason}` : '';
      const failures = p.failureCount > 0 ? ` (eșecuri la rând: ${p.failureCount})` : '';
      out.push(`- ${p.institution}: [${p.title.replaceAll(']', ')')}](${p.url})${reason}${failures}`);
    }
    out.push('');
  }
  return out;
}

export function renderReport(input: ReportInput): string {
  const of = (kind: RunEvent['kind']) => input.events.filter((e) => e.kind === kind);
  const baselines = of('baseline');
  const stats = `Surse verificate: ${input.checked}. Cereri: ${input.requests}. Descărcat: ${kb(input.bytes)}.`;
  const heading = `# Monitor subvenții – ${input.date}`;

  const errors = input.errors ?? [];
  const sections = [
    ...(input.digest ?? []),
    ...newLinks(of('new_link')),
    ...changed(of('changed')),
    ...list('Surse dispărute', of('gone')),
    ...list('Surse revenite', of('returned')),
    ...list('Surse blocate de robots.txt', of('blocked')),
    ...list('Pagini suspecte (text mult mai scurt, de verificat)', of('suspicious')),
    ...list('De verificat manual (aproape fără text)', of('needs_manual')),
    ...list('Erori', of('error')),
    ...(errors.length > 0 ? ['## Erori ale rulării', '', ...errors.map((e) => `- ${e}`), ''] : []),
  ];

  if (sections.length === 0 && baselines.length === 0 && input.pendingLinks === 0) {
    return [heading, '', 'Nu s-a schimbat nimic.', '', stats, '', ...health(input.problems ?? [])].join('\n');
  }

  return [
    heading, '',
    stats,
    ...(baselines.length > 0 ? ['', `Surse noi înregistrate ca punct de pornire: ${baselines.length}.`] : []),
    ...(input.pendingLinks > 0 ? ['', `Linkuri noi în așteptare pentru rularea următoare: ${input.pendingLinks}.`] : []),
    '',
    ...sections,
    ...health(input.problems ?? []),
  ].join('\n');
}
