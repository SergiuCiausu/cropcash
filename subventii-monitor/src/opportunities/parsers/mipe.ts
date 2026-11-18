// MIPE's calendar has no table in its HTML. Every call is in one JSON list inside
// a script, and it covers all programmes, including every region.
import type { Draft } from '../types.ts';

const MARKER = 'var RAW = ';

interface MipeCall {
  mca_call_key: string;
  program: string;
  denumire_apel: string;
  stare_apel: string;
  zona_geografica: string;
  buget_total_euro: number | null;
  beneficiari_eligibili: string;
  tip_apel: string;
  start_date: string | null;
  end_date: string | null;
}

/** Finds the end of the list by tracking brackets, ignoring those inside strings. */
function extractList(html: string): string | null {
  const start = html.indexOf(MARKER);
  if (start < 0) return null;
  const from = start + MARKER.length;
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '[') {
      depth += 1;
    } else if (c === ']') {
      depth -= 1;
      if (depth === 0) return html.slice(from, i + 1);
    }
  }
  return null;
}

const text = (value: string | null | undefined) => value?.trim() || null;

/** MIPE repeats region names, as in "Acoperire nationala ,Acoperire nationala". */
function region(value: string): string | null {
  const parts = [...new Set(value.split(',').map((p) => p.trim()).filter(Boolean))];
  return parts.length > 0 ? parts.join(', ') : null;
}

export function parseMipeCalendar(html: string, url: string): Draft[] {
  const list = extractList(html);
  if (!list) return [];

  let calls: MipeCall[];
  try {
    calls = JSON.parse(list) as MipeCall[];
  } catch {
    return [];
  }

  return calls.map((c) => {
    const applicants = text(c.beneficiari_eligibili);
    // Calls still being edited by MIPE can change, and some have no end date.
    const certain = c.stare_apel === 'VALIDAT' && Boolean(c.start_date && c.end_date && applicants);
    return {
      stableKey: `mipe:${c.mca_call_key}`,
      kind: 'mipe' as const,
      programme: c.program.trim(),
      title: c.denumire_apel.trim(),
      sourceState: text(c.stare_apel),
      openDate: text(c.start_date),
      deadline: text(c.end_date),
      budgetEur: c.buget_total_euro,
      applicants,
      region: region(c.zona_geografica),
      url,
      confidence: certain ? 'high' as const : 'low' as const,
      evidence: `${c.tip_apel}; ${c.stare_apel}`.slice(0, 500),
    };
  });
}
