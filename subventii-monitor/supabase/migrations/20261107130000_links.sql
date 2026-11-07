-- Links found on index pages. Rows from a page's first visit are the baseline:
-- they are remembered but neither reported nor monitored.

create table links_seen (
  id bigint generated always as identity primary key,
  index_source_id bigint not null references sources (id),
  url text not null,
  link_text text,
  score integer not null default 0,
  is_document boolean not null default false,
  version_key text,
  is_baseline boolean not null default false,
  source_added boolean not null default false,
  first_seen timestamptz not null default now(),
  unique (index_source_id, url)
);
create index links_seen_pending_idx on links_seen (score desc) where not is_baseline and not source_added;

alter table links_seen enable row level security;

alter table change_events drop constraint change_events_kind_check;
alter table change_events add constraint change_events_kind_check
  check (kind in ('baseline', 'changed', 'gone', 'returned', 'blocked', 'error', 'suspicious', 'needs_manual', 'new_link'));
