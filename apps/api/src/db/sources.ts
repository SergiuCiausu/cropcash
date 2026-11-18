import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewPage, PageState } from 'subventii-monitor/pages';

/** One source as its owner sees it. */
export interface FarmerSource {
  id: number;
  name: string | null;
  url: string;
  title: string | null;
  kind: 'pagina' | 'pdf' | null;
  state: PageState;
  preview: string | null;
  checkedAt: string;
  changedAt: string | null;
  shortDiff: string | null;
}

export interface SourcesStore {
  list(owner: string): Promise<FarmerSource[]>;
  pageId(url: string): Promise<number | null>;
  pageCount(): Promise<number>;
  addPage(page: NewPage): Promise<number>;
  attach(owner: string, pageId: number, name: string | null): Promise<void>;
  remove(owner: string, id: number): Promise<boolean>;
}

const COLUMNS = 'id, name, watched_pages (url, title, kind, state, preview, checked_at, changed_at, short_diff)';

interface Row {
  id: number;
  name: string | null;
  watched_pages: {
    url: string;
    title: string | null;
    kind: FarmerSource['kind'];
    state: PageState;
    preview: string | null;
    checked_at: string;
    changed_at: string | null;
    short_diff: string | null;
  };
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Uses the secret key: these tables are closed to everyone else, so every query names the owner. */
export function supabaseSources(admin: SupabaseClient): SourcesStore {
  return {
    async list(owner) {
      const { data, error } = await admin
        .from('farmer_sources')
        .select(COLUMNS)
        .eq('owner_hash', owner)
        .order('created_at', { ascending: false });
      fail(error);
      return (data as unknown as Row[]).map(({ id, name, watched_pages: p }) => ({
        id,
        name,
        url: p.url,
        title: p.title,
        kind: p.kind,
        state: p.state,
        preview: p.preview,
        checkedAt: p.checked_at,
        changedAt: p.changed_at,
        shortDiff: p.short_diff,
      }));
    },

    async pageId(url) {
      const { data, error } = await admin.from('watched_pages').select('id').eq('url', url).maybeSingle();
      fail(error);
      return data?.id ?? null;
    },

    async pageCount() {
      const { count, error } = await admin.from('watched_pages').select('id', { count: 'exact', head: true });
      fail(error);
      return count ?? 0;
    },

    async addPage(page) {
      const { data, error } = await admin.from('watched_pages').upsert(page, { onConflict: 'url' }).select('id').single();
      fail(error);
      return data!.id;
    },

    async attach(owner, pageId, name) {
      const { error } = await admin
        .from('farmer_sources')
        .upsert({ owner_hash: owner, page_id: pageId, name }, { onConflict: 'owner_hash,page_id', ignoreDuplicates: true });
      fail(error);
    },

    async remove(owner, id) {
      const { data, error } = await admin
        .from('farmer_sources')
        .delete()
        .eq('id', id)
        .eq('owner_hash', owner)
        .select('page_id')
        .maybeSingle();
      fail(error);
      if (!data) return false;
      // A page nobody follows stops being read.
      const { count, error: countError } = await admin
        .from('farmer_sources')
        .select('id', { count: 'exact', head: true })
        .eq('page_id', data.page_id);
      fail(countError);
      if (count === 0) fail((await admin.from('watched_pages').delete().eq('id', data.page_id)).error);
      return true;
    },
  };
}
