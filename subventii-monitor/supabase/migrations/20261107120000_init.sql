-- Monitor schema. Only the script touches these tables, using the secret key,
-- so RLS is on with no policies: nothing is reachable with the public key.

create table sources (
  id bigint generated always as identity primary key,
  url text not null unique,
  resolved_url text,
  institution text not null,
  title text not null,
  type text not null check (type in ('index', 'pagina', 'pdf')),
  frequency text not null check (frequency in ('daily', 'weekly')),
  verified_in_spec boolean not null default false,
  discovered_from bigint references sources (id),
  state text not null default 'new'
    check (state in ('new', 'active', 'needs_manual', 'suspicious', 'gone', 'blocked', 'error')),
  next_due timestamptz not null default now(),
  last_checked timestamptz,
  etag text,
  last_modified text,
  content_length text,
  content_hash text,
  file_hash text,
  text_chars integer,
  failure_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index sources_next_due_idx on sources (next_due);

create table runs (
  id bigint generated always as identity primary key,
  kind text not null,
  started timestamptz not null default now(),
  finished timestamptz,
  requests integer not null default 0,
  bytes bigint not null default 0,
  stops jsonb not null default '{}'
);

-- Written only when content really changes. Text lives in the snapshots bucket.
create table snapshots (
  id bigint generated always as identity primary key,
  source_id bigint not null references sources (id),
  run_id bigint not null references runs (id),
  taken_at timestamptz not null default now(),
  http_status integer,
  content_hash text not null,
  file_hash text not null,
  text_path text,
  diff_path text
);
create index snapshots_source_idx on snapshots (source_id, taken_at desc);

-- What Plan B and the daily report read. processed_at marks Plan B's progress.
create table change_events (
  id bigint generated always as identity primary key,
  source_id bigint not null references sources (id),
  run_id bigint not null references runs (id),
  snapshot_id bigint references snapshots (id),
  kind text not null
    check (kind in ('baseline', 'changed', 'gone', 'returned', 'blocked', 'error', 'suspicious', 'needs_manual')),
  detail text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index change_events_unprocessed_idx on change_events (created_at) where processed_at is null;

create table robots_cache (
  origin text primary key,
  fetched_at timestamptz not null,
  http_status integer not null,
  body text not null
);

alter table sources enable row level security;
alter table runs enable row level security;
alter table snapshots enable row level security;
alter table change_events enable row level security;
alter table robots_cache enable row level security;

insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', false);
