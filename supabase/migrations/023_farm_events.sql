-- The farmer's own calendar events (docs/calendar-events-plan.md).
-- farm_events            one event or one repeating series (anything that isn't work on a parcel)
-- farm_event_occurrences what is different about one date of a series: moved, renamed, another sum,
--                        cancelled, done, or the sale/expense it became
-- Parcel work stays in plot_operations (020). Every function is SECURITY INVOKER, so RLS applies.
-- Safe to run again.

create table if not exists public.farm_events (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  category text not null check (category in ('crop', 'animals', 'machinery', 'money', 'paperwork', 'other')),
  title text not null check (char_length(title) between 1 and 80),
  note text check (char_length(note) between 1 and 500),
  starts_on date not null,
  ends_on date,
  at_time time,
  repeat text not null default 'none' check (repeat in ('none', 'monthly', 'yearly')),
  repeat_until date,
  remind_days_before int check (remind_days_before between 0 and 60),
  crop_id text check (char_length(crop_id) between 1 and 40),
  plot_id uuid,
  direction text check (direction in ('in', 'out')),
  amount_bani bigint check (amount_bani > 0),
  expense_category text check (char_length(expense_category) between 1 and 40),
  replaces_estimate boolean not null default false,
  -- Set by the phone before the first send, so an event queued offline is saved once.
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, farmer_id),
  constraint farm_events_ends check (ends_on is null or ends_on >= starts_on),
  constraint farm_events_repeat_until check (repeat_until is null or repeat_until >= starts_on - 1),
  constraint farm_events_repeat_one_day check (repeat = 'none' or ends_on is null),
  constraint farm_events_money check ((category = 'money') = (direction is not null)),
  constraint farm_events_amount check (amount_bani is null or category = 'money'),
  constraint farm_events_expense_category check (expense_category is null or direction = 'out'),
  constraint farm_events_plot_fk foreign key (plot_id, farmer_id)
    references public.plots (id, farmer_id) on delete set null (plot_id)
);
create unique index if not exists farm_events_farmer_client_id
  on public.farm_events (farmer_id, client_id) where client_id is not null;
create index if not exists farm_events_farmer_start on public.farm_events (farmer_id, starts_on);

create table if not exists public.farm_event_occurrences (
  event_id uuid not null,
  farmer_id uuid not null references farmers(id) on delete cascade,
  original_date date not null,
  moved_to date,
  at_time time,
  title text check (char_length(title) between 1 and 80),
  note text check (char_length(note) between 1 and 500),
  amount_bani bigint check (amount_bani > 0),
  cancelled boolean not null default false,
  done_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, original_date),
  -- An occurrence can only belong to an event of the same farm.
  constraint farm_event_occurrences_event_fk foreign key (event_id, farmer_id)
    references public.farm_events (id, farmer_id) on delete cascade on update cascade
);
create index if not exists farm_event_occurrences_farmer on public.farm_event_occurrences (farmer_id);

alter table public.farm_events enable row level security;
alter table public.farm_event_occurrences enable row level security;
drop policy if exists farm_events_own on public.farm_events;
create policy farm_events_own on public.farm_events for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));
drop policy if exists farm_event_occurrences_own on public.farm_event_occurrences;
create policy farm_event_occurrences_own on public.farm_event_occurrences for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));
-- Since 30 October 2026, new public tables get no automatic grants.
grant select, insert, update, delete on table public.farm_events to authenticated, service_role;
grant select, insert, update, delete on table public.farm_event_occurrences to authenticated, service_role;

-- „Toate”: changes the series and drops the date rows that no longer fit, in one go.
-- p_patch holds farm_events columns (snake_case); keys that aren't columns are ignored.
create or replace function public.update_farm_event(p_id uuid, p_patch jsonb, p_drop date[]) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v farm_events%rowtype;
begin
  select * into v from farm_events where id = p_id for update;
  if not found then
    return false;
  end if;
  v := jsonb_populate_record(v, p_patch - 'id' - 'farmer_id' - 'client_id' - 'created_at');
  update farm_events set
    category = v.category, title = v.title, note = v.note, starts_on = v.starts_on, ends_on = v.ends_on,
    at_time = v.at_time, repeat = v.repeat, repeat_until = v.repeat_until,
    remind_days_before = v.remind_days_before, crop_id = v.crop_id, plot_id = v.plot_id,
    direction = v.direction, amount_bani = v.amount_bani, expense_category = v.expense_category,
    replaces_estimate = v.replaces_estimate, updated_at = now()
  where id = p_id;
  delete from farm_event_occurrences
   where event_id = p_id and original_date = any (coalesce(p_drop, '{}'))
     and done_at is null and transaction_id is null;
  return true;
end $$;
revoke all on function public.update_farm_event(uuid, jsonb, date[]) from public, anon;
grant execute on function public.update_farm_event(uuid, jsonb, date[]) to authenticated;

-- „De acum înainte”: the old series stops the day before p_from, a new series (p_next, with its
-- own id from the phone) starts there. Date rows in p_move go to the new series, those in p_drop go.
-- Sending it again does nothing new: the new id already exists.
create or replace function public.split_farm_event(p_id uuid, p_from date, p_next jsonb, p_move date[], p_drop date[])
  returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_old farm_events%rowtype;
  v_new farm_events%rowtype;
begin
  select * into v_old from farm_events where id = p_id for update;
  if not found then
    return false;
  end if;
  v_new := jsonb_populate_record(v_old, p_next - 'farmer_id' - 'created_at');
  if v_new.id is null or v_new.id = p_id then
    raise exception 'the new series needs its own id' using errcode = '22023';
  end if;
  if exists (select 1 from farm_events where id = v_new.id) then
    return true;
  end if;
  update farm_events set repeat_until = p_from - 1, updated_at = now() where id = p_id;
  insert into farm_events (id, farmer_id, category, title, note, starts_on, ends_on, at_time, repeat, repeat_until,
                           remind_days_before, crop_id, plot_id, direction, amount_bani, expense_category, replaces_estimate)
  values (v_new.id, v_old.farmer_id, v_new.category, v_new.title, v_new.note, p_from, v_new.ends_on, v_new.at_time,
          v_new.repeat, v_new.repeat_until, v_new.remind_days_before, v_new.crop_id, v_new.plot_id, v_new.direction,
          v_new.amount_bani, v_new.expense_category, v_new.replaces_estimate);
  update farm_event_occurrences set event_id = v_new.id
   where event_id = p_id and original_date = any (coalesce(p_move, '{}'))
     and done_at is null and transaction_id is null;
  delete from farm_event_occurrences
   where event_id = p_id and original_date = any (coalesce(p_drop, '{}'))
     and done_at is null and transaction_id is null;
  return true;
end $$;
revoke all on function public.split_farm_event(uuid, date, jsonb, date[], date[]) from public, anon;
grant execute on function public.split_farm_event(uuid, date, jsonb, date[], date[]) to authenticated;
