import type { SupabaseClient } from '@supabase/supabase-js';
import { OverrideSchema, type Override } from '@cropcash/shared';

/*
 * The admin panel's published changes to docs/data (migration 025, docs/admin-panel-plan.md).
 * Each version holds its whole set of changes; the highest version is in force, version 0 = none.
 */

export interface VersionInfo {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  note: string;
  revertedFrom: number | null;
}

export interface PublishedVersion extends VersionInfo {
  overrides: Override[];
}

/** What every forecast needs: the version in force and its changes. */
export interface CurrentOverrides {
  version: number;
  overrides: Override[];
}

export interface PublishInput {
  /** The version the admin started from. Someone else published since → StaleVersion. */
  baseVersion: number;
  note: string;
  /** Already checked with applyOverrides by the caller. */
  overrides: readonly Override[];
  by: string;
  revertedFrom?: number | null;
}

/** Someone published after the admin opened the panel; nothing was written. */
export class StaleVersion extends Error {}

export interface PredictionStore {
  current(): Promise<CurrentOverrides>;
  /** One version with its changes, null when there is none. */
  version(version: number): Promise<PublishedVersion | null>;
  /** The newest first, without their changes. */
  history(limit: number): Promise<(VersionInfo & { changes: number })[]>;
  /** Returns the new version number. */
  publish(input: PublishInput): Promise<number>;
}

interface VersionRow {
  version: number;
  published_at: string;
  published_by: string | null;
  note: string;
  reverted_from: number | null;
}

interface OverrideRow {
  path: string;
  value: unknown;
  reason: string;
}

const VERSION_COLUMNS = 'version, published_at, published_by, note, reverted_from';

export function toVersionInfo(row: VersionRow): VersionInfo {
  return {
    version: row.version,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    note: row.note,
    revertedFrom: row.reverted_from,
  };
}

/** Rows as stored, in path order, checked with the same schema the API takes them with. */
export function toOverrides(rows: readonly OverrideRow[]): Override[] {
  return [...rows]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((r) => OverrideSchema.parse({ path: r.path, value: r.value, reason: r.reason }));
}

/** `client` reads as anyone signed in may; publishing needs the service-role client. */
export function supabasePredictions(client: SupabaseClient): PredictionStore {
  const rowsOf = async (version: number) => {
    const { data, error } = await client.from('prediction_overrides').select('path, value, reason').eq('version', version);
    if (error) throw new Error(error.message);
    return toOverrides(data as OverrideRow[]);
  };

  return {
    async current() {
      const { data, error } = await client.from('prediction_versions').select('version').order('version', { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      const version = (data as { version: number }[])[0]?.version ?? 0;
      return { version, overrides: version === 0 ? [] : await rowsOf(version) };
    },

    async version(version) {
      const { data, error } = await client.from('prediction_versions').select(VERSION_COLUMNS).eq('version', version).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { ...toVersionInfo(data as VersionRow), overrides: await rowsOf(version) };
    },

    async history(limit) {
      const { data, error } = await client
        .from('prediction_versions')
        .select(`${VERSION_COLUMNS}, prediction_overrides(count)`)
        .order('version', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data as (VersionRow & { prediction_overrides: { count: number }[] })[]).map((row) => ({
        ...toVersionInfo(row),
        changes: row.prediction_overrides[0]?.count ?? 0,
      }));
    },

    async publish({ baseVersion, note, overrides, by, revertedFrom = null }) {
      const { data, error } = await client.rpc('publish_prediction_version', {
        p_base: baseVersion,
        p_note: note,
        p_overrides: overrides.map(({ path, value, reason }) => ({ path, value, reason })),
        p_by: by,
        p_reverted_from: revertedFrom,
      });
      if (error) {
        if (error.code === 'CC409') throw new StaleVersion(error.message);
        throw new Error(error.message);
      }
      return data as number;
    },
  };
}
