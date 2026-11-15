-- 025: the admin panel's changes to docs/data (docs/admin-panel-plan.md). Safe to run again.
--
-- prediction_versions   one row per publish. The highest version is the one in force; 0 rows = the files as written.
-- prediction_overrides  the whole set of changes of a version (a snapshot, not a delta): going back to an
--                       older version publishes a copy of its set as a new version, so history is never rewritten.
--
-- The paths and values are checked by the API with applyOverrides (packages/shared/src/data/overrides.ts)
-- before publish_prediction_version runs. Everyone signed in reads them, because every forecast needs
-- them; only the service role writes, through that function, so an admin goes through the API.

create table if not exists public.prediction_versions (
  version int primary key check (version >= 1),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 500),
  -- Set when this version is a copy of an older one ("Înapoi la versiunea 3").
  reverted_from int references public.prediction_versions (version) on delete set null
);

create table if not exists public.prediction_overrides (
  version int not null references public.prediction_versions (version) on delete cascade,
  path text not null check (char_length(path) between 1 and 300),
  -- A number, text, yes/no or null ("no figure yet"), in the file's own unit.
  value jsonb not null check (jsonb_typeof(value) in ('number', 'string', 'boolean', 'null')),
  -- Why, or where the figure comes from: no figure without a reason.
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  primary key (version, path)
);

do $$
declare t text;
begin
  foreach t in array array['prediction_versions', 'prediction_overrides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- ── Publishing ─────────────────────────────────────────────────────────────────
-- One transaction: the version and all its rows, or nothing. p_base is the version the admin edited;
-- if someone published since, it fails with CC409 and nothing is written (two admins at once).
-- A path twice in p_overrides breaks the primary key and also writes nothing.

create or replace function public.publish_prediction_version(
  p_base int,
  p_note text,
  p_overrides jsonb,
  p_by uuid,
  p_reverted_from int default null
) returns int
  language plpgsql security invoker set search_path = public
as $$
declare
  v_current int;
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtextextended('prediction_versions', 0));
  select coalesce(max(version), 0) into v_current from prediction_versions;
  if p_base is distinct from v_current then
    raise exception 'stale version: edited %, current %', p_base, v_current using errcode = 'CC409';
  end if;
  if jsonb_typeof(p_overrides) is distinct from 'array' then
    raise exception 'overrides must be a list' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_overrides) o where not (o ? 'value')) then
    raise exception 'every change needs a value' using errcode = '22023';
  end if;

  v_next := v_current + 1;
  insert into prediction_versions (version, published_by, note, reverted_from)
  values (v_next, p_by, p_note, p_reverted_from);
  insert into prediction_overrides (version, path, value, reason)
  select v_next, o ->> 'path', o -> 'value', o ->> 'reason'
    from jsonb_array_elements(p_overrides) o;
  return v_next;
end $$;
revoke all on function public.publish_prediction_version(int, text, jsonb, uuid, int) from public, anon, authenticated;
grant execute on function public.publish_prediction_version(int, text, jsonb, uuid, int) to service_role;
