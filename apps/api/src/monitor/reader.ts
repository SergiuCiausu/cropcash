import { plainText, type MonitorData, type MonitorNeed } from '@cropcash/shared';
import type { SupabaseFactory } from '../db/supabase';

const PAGE_SIZE = 1000;
const RECENT_ROWS = 500;
const PASSAGE_LIMIT = 20;

/** Loads what a read function asked for. Tests replace it. */
export interface MonitorReader {
  load(needs: MonitorNeed[], input: unknown, token: string): Promise<MonitorData>;
}

const OPPORTUNITY_COLUMNS =
  'stable_key, kind, programme, title, status, open_date, deadline, budget_eur, applicants, region, url, relevance, relevance_note, confidence, evidence';

/** Words of a search, free of anything the search syntax would read as an operator. */
const searchWords = (text: string) => plainText(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
export const allWords = (text: string) => searchWords(text).join(' ');
/** People type a few loose words: a passage rarely holds all of them. */
export const anyWord = (text: string) => searchWords(text).join(' or ');

export function supabaseMonitor(db: SupabaseFactory): MonitorReader {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  const loaders: { [K in MonitorNeed]: (input: unknown, token: string) => Promise<MonitorData[K]> } = {
    async opportunities(_input, token) {
      const all: NonNullable<MonitorData['opportunities']> = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .forUser(token)
          .from('opportunities')
          .select(OPPORTUNITY_COLUMNS)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        fail(error);
        const page = (data ?? []) as unknown as NonNullable<MonitorData['opportunities']>;
        all.push(...page);
        if (page.length < PAGE_SIZE) return all;
      }
    },

    async opportunityEvents(_input, token) {
      const { data, error } = await db
        .forUser(token)
        .from('opportunity_events')
        .select('field, old_value, new_value, created_at, opportunities (stable_key)')
        .order('created_at', { ascending: false })
        .limit(RECENT_ROWS);
      fail(error);
      const rows = (data ?? []) as unknown as (Omit<NonNullable<MonitorData['opportunityEvents']>[number], 'stable_key'> & {
        opportunities: { stable_key: string } | null;
      })[];
      return rows.flatMap(({ opportunities, ...e }) => (opportunities ? [{ ...e, stable_key: opportunities.stable_key }] : []));
    },

    async sourceChanges(_input, token) {
      const { data, error } = await db
        .forUser(token)
        .from('source_changes')
        .select('id, institution, title, url, kind, short_diff, changed_at')
        .order('changed_at', { ascending: false })
        .limit(RECENT_ROWS);
      fail(error);
      return (data ?? []) as MonitorData['sourceChanges'];
    },

    // sources stays closed to farmers: the server reads these columns and nothing else.
    async sources() {
      const { data, error } = await db
        .admin()
        .from('sources')
        .select('id, institution, title, url, type, state, last_checked')
        .order('institution');
      fail(error);
      return (data ?? []) as MonitorData['sources'];
    },

    async passages(input, token) {
      const { text, institution } = input as { text: string; institution?: string };
      const search = async (terms: string) => {
        let query = db
          .forUser(token)
          .from('documents')
          .select('institution, title, url, body')
          .textSearch('search', terms, { type: 'websearch', config: 'romanian' });
        if (institution) query = query.ilike('institution', `%${institution}%`);
        const { data, error } = await query.limit(PASSAGE_LIMIT);
        fail(error);
        return (data ?? []) as NonNullable<MonitorData['passages']>;
      };
      const all = await search(allWords(text));
      return all.length > 0 ? all : search(anyWord(text));
    },
  };

  return {
    async load(needs, input, token) {
      const entries = await Promise.all(needs.map(async (n) => [n, await loaders[n](input, token)] as const));
      return Object.fromEntries(entries);
    },
  };
}
