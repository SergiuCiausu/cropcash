import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerInput, VerifyAnswer, Verdict } from '@cropcash/shared/verify';

/* The answers to „De verificat” (migration 054, docs/admin-verificari-plan.md). Added, never changed. */

export interface VerifyStore {
  /** Every answer, newest first. A few hundred at most. */
  list(): Promise<VerifyAnswer[]>;
  add(input: AnswerInput, by: { userId: string; email: string | null }): Promise<VerifyAnswer>;
}

interface AnswerRow {
  id: string;
  item_key: string;
  verdict: Verdict;
  new_value: { v: unknown } | null;
  source_url: string | null;
  note: string;
  by_email: string | null;
  at: string;
}

const COLUMNS = 'id, item_key, verdict, new_value, source_url, note, by_email, at';
const MAX_ROWS = 5000;

export function toAnswer(row: AnswerRow): VerifyAnswer {
  return {
    id: row.id,
    itemKey: row.item_key,
    verdict: row.verdict,
    ...(row.new_value ? { newValue: row.new_value.v } : {}),
    sourceUrl: row.source_url,
    note: row.note,
    byEmail: row.by_email,
    at: row.at,
  };
}

/** Needs the service-role client: the API checks the admin itself. */
export function supabaseVerify(client: SupabaseClient): VerifyStore {
  return {
    async list() {
      const { data, error } = await client.from('verify_answers').select(COLUMNS).order('at', { ascending: false }).limit(MAX_ROWS);
      if (error) throw new Error(error.message);
      return (data as AnswerRow[]).map(toAnswer);
    },
    async add(a, by) {
      const { data, error } = await client
        .from('verify_answers')
        .insert({
          item_key: a.itemKey,
          verdict: a.verdict,
          new_value: a.verdict === 'wrong' ? { v: a.newValue ?? null } : null,
          source_url: a.sourceUrl ?? null,
          note: a.note,
          by_user: by.userId,
          by_email: by.email,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toAnswer(data as AnswerRow);
    },
  };
}
