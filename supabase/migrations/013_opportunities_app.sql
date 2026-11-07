-- F6: the app reads what the monitor found, and a farmer can follow a call.
-- Safe to run again. sources, snapshots and change_events stay locked to the monitor.

grant select on table public.opportunities, public.opportunity_events to authenticated;
drop policy if exists opportunities_read on opportunities;
create policy opportunities_read on opportunities for select to authenticated using (true);
drop policy if exists opportunity_events_read on opportunity_events;
create policy opportunity_events_read on opportunity_events for select to authenticated using (true);

-- A call the farmer put in the calendar.
create table if not exists opportunity_follows (
  farmer_id uuid not null references farmers (id) on delete cascade,
  stable_key text not null references opportunities (stable_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (farmer_id, stable_key)
);
alter table opportunity_follows enable row level security;
drop policy if exists opportunity_follows_own on opportunity_follows;
create policy opportunity_follows_own on opportunity_follows for all to authenticated
  using (farmer_id in (select id from farmers where user_id = auth.uid()))
  with check (farmer_id in (select id from farmers where user_id = auth.uid()));
grant select, insert, delete on table public.opportunity_follows to authenticated;
grant select, insert, update, delete on table public.opportunity_follows to service_role;

-- What changed on an official page, written by the monitor. No Storage paths or private columns.
create table if not exists source_changes (
  id bigint generated always as identity primary key,
  source_id bigint not null references sources (id) on delete cascade,
  institution text not null,
  title text not null,
  url text not null,
  kind text not null check (kind in ('changed', 'gone', 'returned')),
  short_diff text,
  changed_at timestamptz not null default now()
);
create index if not exists source_changes_recent_idx on source_changes (changed_at desc);

-- Official text in passages, for search. The search ignores diacritics, because people
-- type without them: the app strips them from the query the same way.
create table if not exists documents (
  id bigint generated always as identity primary key,
  source_id bigint not null references sources (id) on delete cascade,
  position integer not null,
  institution text not null,
  title text not null,
  url text not null,
  body text not null,
  search tsvector generated always as (
    to_tsvector('romanian'::regconfig, translate(lower(body), 'ăâîșțşţ', 'aaistst'))
  ) stored,
  unique (source_id, position)
);
create index if not exists documents_search_idx on documents using gin (search);

alter table source_changes enable row level security;
alter table documents enable row level security;
drop policy if exists source_changes_read on source_changes;
create policy source_changes_read on source_changes for select to authenticated using (true);
drop policy if exists documents_read on documents;
create policy documents_read on documents for select to authenticated using (true);

grant select on table public.source_changes, public.documents to authenticated;
grant select, insert, update, delete on table public.source_changes, public.documents to service_role;
grant usage, select on all sequences in schema public to service_role;
