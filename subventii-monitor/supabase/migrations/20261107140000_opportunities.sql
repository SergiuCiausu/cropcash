-- Funding opportunities parsed from the sources, and the history of each one.

create table opportunities (
  id bigint generated always as identity primary key,
  stable_key text not null unique,
  kind text not null check (kind in ('afir', 'mipe', 'ec')),
  programme text not null,
  title text not null,
  status text not null check (status in ('announced', 'open', 'closed', 'unknown')),
  source_state text,
  open_date date,
  deadline date,
  budget_eur numeric,
  applicants text,
  region text,
  url text not null,
  relevance text not null check (relevance in ('direct', 'conditional', 'partnership', 'not_relevant')),
  relevance_note text,
  confidence text not null check (confidence in ('high', 'low')),
  evidence text,
  first_seen timestamptz not null default now()
);
create index opportunities_kind_idx on opportunities (kind);
create index opportunities_deadline_idx on opportunities (deadline) where status <> 'closed';

create table opportunity_events (
  id bigint generated always as identity primary key,
  opportunity_id bigint not null references opportunities (id),
  run_id bigint not null references runs (id),
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index opportunity_events_run_idx on opportunity_events (run_id);

alter table opportunities enable row level security;
alter table opportunity_events enable row level security;

-- Problems that belong to a run rather than to a source, such as a failed API call.
alter table runs add column errors text[] not null default '{}';
