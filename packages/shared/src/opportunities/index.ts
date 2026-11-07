import type { AppData } from '../data';

/**
 * Funding calls and official changes found by subventii-monitor, shaped for the farmer.
 * Labels here are a first filter, not a legal decision on who can apply: the official
 * guide always has the last word, and the screens say so.
 */

export type OpportunityStatus = 'announced' | 'open' | 'closed' | 'unknown';

export interface StoredOpportunity {
  stable_key: string;
  kind: string;
  programme: string;
  title: string;
  status: OpportunityStatus;
  open_date: string | null;
  deadline: string | null;
  budget_eur: number | null;
  applicants: string | null;
  region: string | null;
  url: string;
  relevance: string;
  relevance_note: string | null;
  confidence: string;
  evidence: string | null;
}

export interface StoredOpportunityEvent {
  stable_key: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface StoredSourceChange {
  id: number;
  institution: string;
  title: string;
  url: string;
  kind: string;
  short_diff: string | null;
  changed_at: string;
}

export interface StoredSource {
  id: number;
  /** index, pagina or pdf. */
  type: string;
  institution: string;
  title: string;
  url: string;
  state: string;
  last_checked: string | null;
}

export interface StoredPassage {
  institution: string;
  title: string;
  url: string;
  body: string;
}

/** What a read function may ask the API to load before it runs. */
export interface MonitorData {
  opportunities?: StoredOpportunity[];
  opportunityEvents?: StoredOpportunityEvent[];
  sourceChanges?: StoredSourceChange[];
  sources?: StoredSource[];
  passages?: StoredPassage[];
}
export type MonitorNeed = keyof MonitorData;

/** Lower case, no diacritics. Search must work the way people type on a phone. */
export function plainText(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000;

/** The stored status was right on the day of the check; the dates are right today. */
export function statusToday(o: Pick<StoredOpportunity, 'status' | 'open_date' | 'deadline'>, today: string): OpportunityStatus {
  if (o.deadline && o.deadline < today) return 'closed';
  if (o.open_date && o.open_date > today) return 'announced';
  if (o.open_date || o.deadline) return 'open';
  return o.status;
}

export function opportunityRow(o: StoredOpportunity, today: string) {
  return {
    key: o.stable_key,
    title: o.title,
    programme: o.programme,
    kind: o.kind,
    status: statusToday(o, today),
    openDate: o.open_date,
    deadline: o.deadline,
    daysLeft: o.deadline ? dayNumber(o.deadline) - dayNumber(today) : null,
    /** Euro cents. The official figure, never converted. */
    budgetEurCents: o.budget_eur === null ? null : Math.round(o.budget_eur * 100),
    applicants: o.applicants,
    region: o.region,
    relevance: o.relevance,
    relevanceNote: o.relevance_note,
    lowConfidence: o.confidence === 'low',
    url: o.url,
  };
}
export type OpportunityRow = ReturnType<typeof opportunityRow>;

const byDeadline = (a: OpportunityRow, b: OpportunityRow) => {
  if (a.deadline === b.deadline) return a.title.localeCompare(b.title);
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
};

export interface OpportunityFilter {
  text?: string;
  programme?: string;
  status?: OpportunityStatus;
  /** Only calls that close on or before this date. */
  closesBy?: string;
  minBudgetEur?: number;
  /** Also shows what the monitor marked as not for farmers. */
  includeNotRelevant?: boolean;
}

export function filterOpportunities(rows: StoredOpportunity[], f: OpportunityFilter, today: string): OpportunityRow[] {
  const words = plainText(f.text).split(/\s+/).filter(Boolean);
  return rows
    .filter((o) => {
      if (!f.includeNotRelevant && o.relevance === 'not_relevant') return false;
      const haystack = plainText(`${o.title} ${o.programme} ${o.applicants ?? ''}`);
      return words.every((w) => haystack.includes(w));
    })
    .map((o) => opportunityRow(o, today))
    .filter((o) => (f.status ? o.status === f.status : o.status !== 'closed'))
    .filter((o) => !f.programme || plainText(o.programme).includes(plainText(f.programme)))
    .filter((o) => !f.closesBy || (o.deadline !== null && o.deadline <= f.closesBy))
    .filter((o) => f.minBudgetEur === undefined || (o.budgetEurCents ?? 0) >= f.minBudgetEur * 100)
    .sort(byDeadline);
}

export function closingSoonRows(rows: StoredOpportunity[], days: number, today: string): OpportunityRow[] {
  return filterOpportunities(rows, {}, today).filter((o) => o.daysLeft !== null && o.daysLeft <= days);
}

// ── Matching a call to a farm ───────────────────────────────────────────────

export interface MatchReason {
  /** Key under `opportunities.reasons` in ro.json. */
  code: string;
  vars?: Record<string, number>;
}

export interface MatchFarm {
  birth_year: number;
  county?: string | null;
  dairy_cows?: number | null;
  beef_cattle?: number | null;
  parcels?: { crop_id: string }[];
}

/** Sectors a call can be limited to, and the crops that belong to each one. */
const SECTORS: { name: RegExp; crops: RegExp; animals?: boolean }[] = [
  { name: /sector zootehnic|zootehni/, crops: /$^/, animals: true },
  { name: /legumicul/, crops: /legum|tomat|cartof|ardei|ceap/ },
  { name: /pomicol/, crops: /pomi|mar|prun|cires|nuc/ },
  { name: /viticol/, crops: /vie|strugur/ },
  { name: /floricult|plante medicinale/, crops: /flori(?!a-soarelui)|medicinal/ },
  { name: /apicol/, crops: /$^/ },
  { name: /acvacultur|piscicol|pescuit/, crops: /$^/ },
];

const isOtherSector = (title: string, farm: MatchFarm) => {
  const sector = SECTORS.find((s) => s.name.test(title));
  if (!sector) return false;
  if (sector.animals && (farm.dairy_cows ?? 0) + (farm.beef_cattle ?? 0) > 0) return false;
  return !(farm.parcels ?? []).some((p) => sector.crops.test(plainText(p.crop_id)));
};

const isOtherRegion = (o: StoredOpportunity, farmRegion: string | null, regions: string[]) => {
  if (!farmRegion) return false;
  const region = plainText(farmRegion).replace(/-/g, ' ');
  const title = plainText(o.title).replace(/-/g, ' ');
  if (regions.some((r) => r !== region && title.includes(`regiunea ${r}`))) return true;
  const regional = /^program regional (.+)$/.exec(plainText(o.programme).replace(/-/g, ' '));
  if (regional) return !region.startsWith(regional[1]!);
  const area = plainText(o.region);
  const capital = region.startsWith('bucuresti');
  if (area === 'regiuni mai dezvoltate') return !capital;
  if (area === 'regiuni mai putin dezvoltate') return capital;
  return false;
};

/** A doubt that rules the call out for this farm, rather than one the farmer should check. */
const RULES_OUT = new Set(['age_limit', 'other_sector', 'other_region', 'partnership', 'institutions_only', 'not_for_farms']);

/** The call's code, as AFIR writes it at the start of the title: "DR-14: …". */
export const callCode = (title: string) => /^DR-\d+/.exec(title)?.[0] ?? null;

function reasonsFor(
  o: StoredOpportunity,
  row: OpportunityRow,
  ctx: { farm: MatchFarm; age: number; soonDays: number; otherRegion: boolean; data: AppData },
) {
  const title = plainText(o.title);
  const who = plainText(o.applicants);
  const good: MatchReason[] = [];
  const doubts: MatchReason[] = [];

  if (ctx.otherRegion) doubts.push({ code: 'other_region' });
  const limit = /maximum (\d+) de ani/.exec(title);
  if (limit && ctx.age > Number(limit[1])) doubts.push({ code: 'age_limit', vars: { limit: Number(limit[1]) } });
  else if (!limit && /tiner\w* fermier/.test(title)) doubts.push({ code: 'young_farmers' });
  if (isOtherSector(title, ctx.farm)) doubts.push({ code: 'other_sector' });
  if (/^trenul|autorit/.test(title) || /autorit|asociatie de dezvoltare/.test(who)) doubts.push({ code: 'institutions_only' });
  // The farm has no legal form on file, so it's taken to be a person, as most small farms are.
  const guide = ctx.data.fundingGuides.guides.find((g) => g.code === callCode(o.title));
  if (guide && !guide.natural_persons_can_apply) doubts.push({ code: 'needs_company' });

  if (o.relevance === 'direct') good.push({ code: 'for_farmers' });
  else if (o.relevance === 'partnership') doubts.push({ code: 'partnership' });
  else if (/intreprinder/.test(who)) doubts.push({ code: 'firms_only' });
  else if (!who && /agri/.test(title)) doubts.push({ code: 'check_who' });
  else doubts.push({ code: 'not_for_farms' });
  if (/mici dimensiuni/.test(title)) good.push({ code: 'small_farms' });
  if (row.daysLeft !== null && row.daysLeft <= ctx.soonDays) good.push({ code: 'closes_soon', vars: { days: row.daysLeft } });
  if (row.lowConfidence) doubts.push({ code: 'low_confidence' });
  return { good, doubts };
}

/**
 * How close a call is. `near`: nothing against it, or only a paper the farmer can get (a PFA).
 * `firm`: for businesses. `check`: a doubt to check. `no`: something rules it out.
 */
export type MatchLevel = 'near' | 'firm' | 'check' | 'no';
function levelOf(doubts: MatchReason[]): MatchLevel {
  if (doubts.some((d) => RULES_OUT.has(d.code))) return 'no';
  if (doubts.some((d) => d.code === 'firms_only')) return 'firm';
  return doubts.every((d) => d.code === 'needs_company') ? 'near' : 'check';
}

/**
 * Calls worth this farm's time. `forYou` found nothing against them; `check` has a doubt the
 * farmer should see; `notForYou` has a reason that rules it out (another region, an age limit,
 * consortiums, institutions only). Calls marked not relevant and closed calls are left out.
 */
export function matchOpportunityRows(rows: StoredOpportunity[], farm: MatchFarm, data: AppData, today: string) {
  const farmRegion = data.counties.counties.find((c) => c.code === farm.county)?.region_ro ?? null;
  const regions = [...new Set(data.counties.counties.map((c) => plainText(c.region_ro).replace(/-/g, ' ')))];
  const age = Number(today.slice(0, 4)) - farm.birth_year;
  const soonDays = data.params.opportunities_closing_soon_days.value;

  const matched = rows
    .filter((o) => o.relevance !== 'not_relevant')
    .map((o) => {
      const row = opportunityRow(o, today);
      const reasons = reasonsFor(o, row, { farm, age, soonDays, otherRegion: isOtherRegion(o, farmRegion, regions), data });
      return { ...row, ...reasons, level: levelOf(reasons.doubts) };
    })
    .filter((o) => o.status !== 'closed')
    .sort((a, b) => a.doubts.length - b.doubts.length || byDeadline(a, b));

  const direct = (o: OpportunityRow) => o.relevance === 'direct';
  return {
    forYou: matched.filter((o) => o.doubts.length === 0),
    check: matched
      .filter((o) => o.doubts.length > 0 && o.level !== 'no')
      .sort((a, b) => Number(direct(b)) - Number(direct(a))),
    notForYou: matched.filter((o) => o.level === 'no').sort(byDeadline),
  };
}
export type OpportunityMatch = ReturnType<typeof matchOpportunityRows>['forYou'][number];

export function opportunityChangeRows(
  events: StoredOpportunityEvent[],
  rows: StoredOpportunity[],
  days: number,
  today: string,
) {
  const byKey = new Map(rows.map((o) => [o.stable_key, o]));
  return events.flatMap((e) => {
    const o = byKey.get(e.stable_key);
    if (!o || o.relevance === 'not_relevant') return [];
    if (dayNumber(today) - dayNumber(e.created_at) > days) return [];
    return [{ key: o.stable_key, title: o.title, kind: o.kind, field: e.field, from: e.old_value, to: e.new_value, date: e.created_at.slice(0, 10), url: o.url }];
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function sourceChangeRows(rows: StoredSourceChange[], f: { institution?: string; days: number }, today: string) {
  return rows
    .filter((c) => !f.institution || plainText(c.institution).includes(plainText(f.institution)))
    .filter((c) => dayNumber(today) - dayNumber(c.changed_at) <= f.days)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .map((c) => ({ id: c.id, institution: c.institution, title: c.title, kind: c.kind, date: c.changed_at.slice(0, 10), url: c.url, shortDiff: c.short_diff }));
}
