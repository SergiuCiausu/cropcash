-- Pages farmers add on surse.html, apart from the official list. Safe to run again.
-- There's no sign-in yet: the owner is a hash of a random key kept in the farmer's browser.
-- anon and authenticated get nothing: only the API and the monitor, with the secret key, read this.

-- One read per link, so two farmers adding the same page share it.
create table if not exists watched_pages (
  id bigint generated always as identity primary key,
  url text not null unique,
  final_url text,
  kind text check (kind in ('pagina', 'pdf')),
  title text,
  state text not null check (state in ('ok', 'thin', 'blocked', 'gone', 'error')),
  preview text,
  text text,
  content_hash text,
  short_diff text,
  failure_count integer not null default 0,
  changed_at timestamptz,
  checked_at timestamptz not null default now(),
  next_due timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists watched_pages_next_due_idx on watched_pages (next_due);

create table if not exists farmer_sources (
  id bigint generated always as identity primary key,
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  page_id bigint not null references watched_pages (id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  unique (owner_hash, page_id)
);
create index if not exists farmer_sources_page_idx on farmer_sources (page_id);

alter table watched_pages enable row level security;
alter table farmer_sources enable row level security;
revoke all on table public.watched_pages, public.farmer_sources from anon, authenticated;
grant select, insert, update, delete on table public.watched_pages, public.farmer_sources to service_role;
