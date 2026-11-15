/* The farmer's own calendar events (migration 023). Every call acts as the farmer, so RLS decides
   what they may see and change. */
import type { PostgrestError } from '@supabase/supabase-js';
import type { StoredEvent, StoredOccurrence } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export class EventsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface EventStore {
  /** The event with its date rows, or null when it isn't the farmer's. */
  get(token: string, id: string): Promise<StoredEvent | null>;
  /** Sent again with the same client id, it returns the first id. */
  add(token: string, farmerId: string, row: Record<string, unknown>, clientId?: string): Promise<string>;
  /** „Toate”: the series' new columns, and the dates whose rows no longer fit. */
  update(token: string, id: string, row: Record<string, unknown>, drop: string[]): Promise<boolean>;
  /** „De acum înainte”: a new series from `from`. */
  split(token: string, id: string, from: string, next: Record<string, unknown>, move: string[], drop: string[]): Promise<boolean>;
  remove(token: string, id: string): Promise<boolean>;
  /** Saves one date's row (insert or replace). */
  setOccurrence(token: string, farmerId: string, row: StoredOccurrence): Promise<void>;
}

export const EVENT_COLUMNS =
  'id, category, title, note, starts_on, ends_on, at_time, repeat, repeat_until, remind_days_before, crop_id, plot_id, ' +
  'direction, amount_bani, expense_category, replaces_estimate, created_at';
export const OCCURRENCE_COLUMNS = 'event_id, original_date, moved_to, at_time, title, note, amount_bani, cancelled, done_at, transaction_id';

function refusal(e: PostgrestError): Error {
  if (e.code === '22023' || e.code === '23514' || e.code === '22P02' || e.code === '22007') return new EventsError(400, 'invalid_input', e.message);
  // 23503: a parcel or event that isn't this farm's.
  if (e.code === '23503') return new EventsError(400, 'invalid_input', e.message);
  return new Error(e.message);
}

/** bigint comes back as a number or a string, depending on its size. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const eventFromRow = (r: Record<string, unknown>): StoredEvent =>
  ({
    ...r,
    amount_bani: num(r.amount_bani),
    farm_event_occurrences: ((r.farm_event_occurrences as Record<string, unknown>[] | undefined) ?? []).map((o) => ({ ...o, amount_bani: num(o.amount_bani) })),
  }) as unknown as StoredEvent;

export function supabaseEvents(db: SupabaseFactory): EventStore {
  return {
    async get(token, id) {
      const { data, error } = await db
        .forUser(token)
        .from('farm_events')
        .select(`${EVENT_COLUMNS}, farm_event_occurrences (${OCCURRENCE_COLUMNS})`)
        .eq('id', id)
        .maybeSingle();
      if (error) throw refusal(error);
      return data ? eventFromRow(data as Record<string, unknown>) : null;
    },

    async add(token, farmerId, row, clientId) {
      const client = db.forUser(token);
      // The phone's client id is the event's id, so writes queued after it can already name it.
      const { data, error } = await client
        .from('farm_events')
        .insert({ ...row, ...(clientId ? { id: clientId } : {}), farmer_id: farmerId, client_id: clientId ?? null })
        .select('id')
        .single();
      // Sent before (the answer was lost): return the row already saved.
      if (error?.code === '23505' && clientId) {
        const again = await client.from('farm_events').select('id').eq('id', clientId).maybeSingle();
        if (again.error) throw refusal(again.error);
        if (!again.data) throw new EventsError(409, 'already_saved', 'that id belongs to another farm');
        return again.data.id as string;
      }
      if (error) throw refusal(error);
      return data.id as string;
    },

    async update(token, id, row, drop) {
      const { data, error } = await db.forUser(token).rpc('update_farm_event', { p_id: id, p_patch: row, p_drop: drop });
      if (error) throw refusal(error);
      return data === true;
    },

    async split(token, id, from, next, move, drop) {
      const { data, error } = await db.forUser(token).rpc('split_farm_event', { p_id: id, p_from: from, p_next: next, p_move: move, p_drop: drop });
      if (error) throw refusal(error);
      return data === true;
    },

    async remove(token, id) {
      const { data, error } = await db.forUser(token).from('farm_events').delete().eq('id', id).select('id');
      if (error) throw refusal(error);
      return (data?.length ?? 0) > 0;
    },

    async setOccurrence(token, farmerId, row) {
      const { error } = await db
        .forUser(token)
        .from('farm_event_occurrences')
        .upsert({ ...row, farmer_id: farmerId, updated_at: new Date().toISOString() }, { onConflict: 'event_id,original_date' });
      if (error) throw refusal(error);
    },
  };
}
