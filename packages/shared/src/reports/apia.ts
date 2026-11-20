/* What this farm files with APIA (and the primărie) and what it keeps for a control, from
   docs/data/apia-papers.json (docs/rapoarte-apia-plan.md). Pure: which papers apply to the farm, from
   what the app knows about it, and when each is due, from the calendar. The reports that fill them are
   in web/lib/reports. Dates are projected to later years the same way „De raportat” does. */
import { z } from 'zod';
import { daysBetween } from '../calendar/events';
import { StatusSchema, type CalendarFile, type Status } from '../data/schemas';
import { shiftYears } from '../obligations/index';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the app may know about a farm, for deciding which papers apply. */
export const APIA_FACTS = ['arable', 'grassland', 'fallow', 'fuel', 'animals', 'coupled_crops', 'organic'] as const;
export type ApiaFact = (typeof APIA_FACTS)[number];

export const ApiaPaperSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** apia: filed at APIA. control: kept on the farm and shown at a check. primarie: filed at the town hall. */
  group: z.enum(['apia', 'control', 'primarie']),
  title_ro: z.string().min(1),
  about_ro: z.string().min(1),
  /** The report in /rapoarte that fills it (web/lib/reports ReportId), or null: nothing to fill, only what to know. */
  report: z.string().nullable(),
  /** calendar-2026.json events that set its deadlines. */
  deadline_events: z.array(z.string()).optional(),
  /** Its own deadline, for papers only some farms file (not on everyone's calendar). */
  deadline: z.object({ start: IsoDate.nullable(), end: IsoDate, status: StatusSchema, source_url: z.string().url().nullable() }).optional(),
  applies_if: z.array(z.enum(APIA_FACTS)),
  documents_ro: z.array(z.string()),
  how_ro: z.string().nullable(),
  status: StatusSchema,
  source_url: z.string().url().nullable(),
  note: z.string().optional(),
});
export type ApiaPaper = z.infer<typeof ApiaPaperSchema>;

export const ApiaPapersFileSchema = z
  .object({
    meta: z.object({ campaign_year: z.number().int() }).passthrough(),
    papers: z.array(ApiaPaperSchema).min(1),
  })
  .passthrough()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    f.papers.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: 'custom', path: ['papers', i, 'id'], message: `Duplicate paper ${p.id}` });
      ids.add(p.id);
      if (p.deadline && p.deadline_events?.length) ctx.addIssue({ code: 'custom', path: ['papers', i], message: 'Either deadline or deadline_events, not both' });
    });
  });
export type ApiaPapersFile = z.infer<typeof ApiaPapersFileSchema>;

/**
 * What the farmer answered on the „Poate ți se aplică” cards (farmers.apia_facts, migration 051). A key left out
 * wasn't asked. `coupledCrops`: the crops declared for coupled support (an empty list is a no).
 */
export const ApiaAnswersSchema = z.strictObject({
  animals: z.boolean().optional(),
  fuel: z.boolean().optional(),
  organic: z.boolean().optional(),
  coupledCrops: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
});
export type ApiaAnswers = z.infer<typeof ApiaAnswersSchema>;

/** PUT /api/farm/apia-facts: the whole set of answers, replacing what was saved. */
export const SetApiaFactsInputSchema = ApiaAnswersSchema;

/** true / false, or null when the app doesn't know (shown as „Poate ți se aplică”, never hidden). */
export type ApiaFacts = Record<ApiaFact, boolean | null>;

export interface FactsInput {
  /** Land-use codes of the farm's parcels this year (TA, PP, CP…), from the map. Empty when nothing is on it. */
  landUses: readonly (string | null)[];
  /** The APIA table section of each crop the farm grows ("I. TEREN ARABIL – TA"…), null for a crop of its own. */
  cropSections: readonly (string | null)[];
  hasFallow: boolean;
  /** Diesel expenses noted in the last year. */
  dieselExpenses: number;
  /** What the farmer answered. Their data wins over an answer only where it says yes (diesel noted). */
  answers?: ApiaAnswers | null;
  /** The heads noted on the farm (farmers.livestock); null when nothing was noted. More than 0 means animals. */
  heads?: number | null;
}

/**
 * What the farm's own data says. Land comes from the map, else from the crops' APIA sections. Diesel
 * noted means the farm uses it; none noted isn't a no (the farmer may just not note it). Animals,
 * coupled support and organic come only from the farmer's answers; unanswered, they're unknown.
 */
export function apiaFacts(input: FactsInput): ApiaFacts {
  const uses = input.landUses.filter((u): u is string => !!u);
  const sections = input.cropSections.filter((s): s is string => !!s);
  const known = uses.length > 0 || sections.length > 0;
  const a = input.answers ?? {};
  const has = (use: string, section: string) => uses.includes(use) || sections.some((s) => s.startsWith(section));
  return {
    arable: known ? has('TA', 'I.') : null,
    grassland: known ? has('PP', 'II.') : null,
    fallow: input.hasFallow,
    fuel: input.dieselExpenses > 0 ? true : (a.fuel ?? null),
    animals: (input.heads ?? 0) > 0 ? true : (a.animals ?? (input.heads === 0 ? false : null)),
    coupled_crops: a.coupledCrops ? a.coupledCrops.length > 0 : null,
    organic: a.organic ?? null,
  };
}

export type FilingSection = 'next' | 'keep' | 'when' | 'past' | 'maybe' | 'not_applicable';

export interface FilingDeadline {
  /** The calendar event, or the paper's own id. */
  eventId: string;
  title: string | null;
  start: string | null;
  end: string;
  daysLeft: number;
  /** Today is inside the window. */
  open: boolean;
  /** Projected from this year's dates to a later one. */
  estimated: boolean;
  status: Status;
  /** The quarter a diesel claim is for ("2026-Q4"). */
  period: string | null;
  note: string | null;
}

export interface Filing {
  paper: ApiaPaper;
  section: FilingSection;
  /** The next deadline, or the last one when none is ahead. Null for papers kept on the farm. */
  deadline: FilingDeadline | null;
  /** „Within N days of …” rules (forță majoră and the like). */
  rules: { eventId: string; title: string; days: number; note: string | null }[];
  /** The facts the app doesn't know that decide whether it applies. */
  unknown: ApiaFact[];
}

interface Dated {
  eventId: string;
  title: string | null;
  start: string | null;
  end: string;
  repeatUntil: string | null;
  status: Status;
  period: string | null;
  note: string | null;
}

/** The first time this window ends on or after today (projected up to 2 years on), else its last end. */
function occurrence(d: Dated, today: string): FilingDeadline {
  let last: FilingDeadline | null = null;
  for (let k = 0; k <= 2; k++) {
    const end = shiftYears(d.end, k);
    const start = d.start ? shiftYears(d.start, k) : null;
    if (k > 0 && d.repeatUntil && (start ?? end) > d.repeatUntil) break;
    const item: FilingDeadline = {
      eventId: d.eventId,
      title: d.title,
      start,
      end,
      daysLeft: daysBetween(today, end),
      open: (!start || start <= today) && today <= end,
      estimated: k > 0,
      status: d.status,
      period: d.period,
      note: d.note,
    };
    if (end >= today) return item;
    last = item;
  }
  return last!;
}

/**
 * The papers for this farm, each with its section and its next deadline. `next`: a deadline ahead,
 * soonest first. `keep`: kept on the farm, no deadline. `when`: only „within N days of …” rules.
 * `past`: every deadline is behind and won't come back (a scheme that ended). `maybe`: depends on
 * something the app doesn't know. `not_applicable`: the farm's data says no.
 */
export function apiaFilings(file: ApiaPapersFile, calendar: CalendarFile, facts: ApiaFacts, today: string): Filing[] {
  const events = new Map(calendar.events.map((e) => [e.id, e]));
  const out = file.papers.map((paper): Filing => {
    const dated: Dated[] = [];
    const rules: Filing['rules'] = [];
    for (const id of paper.deadline_events ?? []) {
      const ev = events.get(id);
      if (!ev) throw new Error(`apia-papers.json: ${paper.id} names calendar event ${id}, which isn't in the calendar`);
      if (ev.end) {
        dated.push({ eventId: id, title: ev.title_ro, start: ev.start, end: ev.end, repeatUntil: ev.repeat_until ?? null, status: ev.status, period: ev.period ?? null, note: ev.note ?? null });
      } else if (ev.relative_days !== undefined) {
        rules.push({ eventId: id, title: ev.title_ro, days: ev.relative_days, note: ev.note ?? null });
      }
    }
    if (paper.deadline) dated.push({ eventId: paper.id, title: null, start: paper.deadline.start, end: paper.deadline.end, repeatUntil: null, status: paper.deadline.status, period: null, note: null });

    const all = dated.map((d) => occurrence(d, today));
    const ahead = all.filter((d) => d.end >= today).sort((a, b) => a.end.localeCompare(b.end));
    const deadline = ahead[0] ?? all.sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;

    const unknown = paper.applies_if.filter((f) => facts[f] === null);
    const no = paper.applies_if.some((f) => facts[f] === false);
    const section: FilingSection = no
      ? 'not_applicable'
      : unknown.length
        ? 'maybe'
        : !dated.length
          ? rules.length
            ? 'when'
            : 'keep'
          : ahead.length
            ? 'next'
            : 'past';
    return { paper, section, deadline, rules, unknown };
  });
  return out.sort((a, b) => (a.deadline?.end ?? '9999').localeCompare(b.deadline?.end ?? '9999') || a.paper.id.localeCompare(b.paper.id));
}

/** docs/data/apia-coupled.json: the crops with coupled support, their minimum per hectare and their proofs. */
export const ApiaCoupledFileSchema = z
  .object({
    meta: z.object({ campaign_year: z.number().int() }).passthrough(),
    schemes: z
      .array(
        z.object({
          id: z.string().regex(/^PD-\d{2}$/),
          name_ro: z.string().min(1),
          codes: z.array(z.number().int().positive()).min(1),
          /** Null: not known (DE-VERIFICAT), so nothing is judged against it. */
          minimum_kg_ha: z.number().int().positive().nullable(),
          minimum_ro: z.string().min(1),
          minimum_status: StatusSchema,
          proof_ro: z.array(z.string().min(1)),
          deadline: IsoDate,
          deadline_status: StatusSchema,
          source_url: z.string().url().nullable(),
        }),
      )
      .min(1),
  })
  .passthrough();
export type ApiaCoupledFile = z.infer<typeof ApiaCoupledFileSchema>;
export type CoupledScheme = ApiaCoupledFile['schemes'][number];

/** The coupled scheme a crop's APIA code belongs to, if any. */
export const coupledSchemeOf = (file: ApiaCoupledFile, code: number | null) => (code === null ? null : (file.schemes.find((s) => s.codes.includes(code)) ?? null));
