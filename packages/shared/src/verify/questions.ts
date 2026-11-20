/* docs/11-open-questions.md read as items (docs/admin-verificari-plan.md, step 2). The doc stays where the team
   writes; this reads its tables (A figures, B assumptions, C contradictions) and the numbered list under
   D „Deschise”. A struck-through item, or one that says Rezolvat / Nu mai e nevoie / Scos, is closed. */

export type QuestionSection = 'A' | 'B' | 'C' | 'D';

export interface OpenQuestion {
  /** `q:A15`, `q:B3`, `q:D32`; a number written twice in the doc gets `-2` on the second one. */
  key: string;
  section: QuestionSection;
  number: string;
  title: string;
  /** The rest of the row or item, as plain text, one cell or line per line. */
  text: string;
  closed: boolean;
  /** Names in backticks that look like a data file or a path: `plan-params.json`, `weather.frost_min_c`. */
  refs: string[];
}

const SECTION_HEAD = /^## ([A-D])\./;
const CLOSED = /~~|\*\*(Rezolvat|Nu mai e nevoie|Scos)\b/i;

/** Markdown to plain text: no bold, no strike, links as their text. Backticks stay out too. */
export const plain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function refsOf(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/`([^`\s]+)`/g)) {
    const r = m[1]!;
    if (/\.json$/.test(r) || /^[a-z_]+(\.[a-zA-Z_0-9[\]=-]+)+$/.test(r)) out.add(r.replace(/^(docs\/)?data\//, ''));
  }
  return [...out];
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Every item in the doc, in doc order. Decisions already taken (D „Luate”) aren't items. */
export function parseOpenQuestions(md: string): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  const seen = new Map<string, number>();
  const push = (section: QuestionSection, number: string, titleMd: string, restMd: string) => {
    const id = `${section}${number}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    const all = `${titleMd}\n${restMd}`;
    out.push({
      key: `q:${id}${n > 1 ? `-${n}` : ''}`,
      section,
      number,
      title: plain(titleMd).replace(/:$/, ''),
      text: restMd
        .split('\n')
        .map(plain)
        .filter(Boolean)
        .join('\n'),
      closed: CLOSED.test(titleMd) || CLOSED.test(restMd),
      refs: refsOf(all),
    });
  };

  let section: QuestionSection | null = null;
  let open = false; // under D „Deschise”
  let item: { number: string; lines: string[] } | null = null;
  const flushD = () => {
    if (!item) return;
    const [first, ...rest] = item.lines;
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(first!);
    if (bold) push('D', item.number, bold[1]!, [bold[2]!, ...rest].join('\n'));
    else push('D', item.number, first!, rest.join('\n'));
    item = null;
  };

  for (const line of md.split(/\r?\n/)) {
    const head = SECTION_HEAD.exec(line);
    if (head) {
      flushD();
      section = head[1] as QuestionSection;
      open = false;
      continue;
    }
    if (section === 'D') {
      if (/^### /.test(line)) {
        flushD();
        open = /Deschise/.test(line);
        continue;
      }
      if (!open) continue;
      const num = /^(\d+)\.\s+(.*)$/.exec(line);
      if (num) {
        flushD();
        item = { number: num[1]!, lines: [num[2]!] };
      } else if (item && line.trim()) item.lines.push(line.trim().replace(/^- /, ''));
      continue;
    }
    if (!section || !/^\|/.test(line) || /^\|\s*-/.test(line)) continue;
    const c = cells(line);
    if (c[0] === '#') continue; // the header row
    const [number, title, ...rest] = c;
    if (!number || !title) continue;
    const labels: Record<QuestionSection, string[]> = {
      A: ['Folosit acum', 'Unde se verifică', 'Ce schimbă'],
      B: ['De ce'],
      C: ['Rezolvare'],
      D: [],
    };
    const restMd = rest.map((r, i) => (labels[section!][i] ? `${labels[section!][i]}: ${r}` : r)).join('\n');
    const stillOpen = section === 'C' && /Deschis|Cer confirmare|De verificat/i.test(rest.join(' '));
    push(section, number.replace(/^[PC](?=\d)/, ''), title, restMd);
    // A contradiction is closed once it has a resolution, unless the resolution says it's still open.
    if (section === 'C') out[out.length - 1]!.closed = !stillOpen || out[out.length - 1]!.closed;
  }
  flushD();
  return out;
}
