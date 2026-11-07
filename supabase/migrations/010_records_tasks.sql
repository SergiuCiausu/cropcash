-- F4: sales and expenses the farmer records, finished tasks, and editing the farm.
-- Every function is SECURITY INVOKER, so RLS applies to each read and write.
-- Safe to run again: part of this reached one database before it was tracked.

alter table transactions
  add column if not exists kind text,
  add column if not exists category text,
  add column if not exists crop_id text,
  add column if not exists note text,
  -- What an expense took from its envelope, so undoing it puts back exactly that.
  add column if not exists envelope_taken_bani bigint not null default 0;

alter table transactions
  drop constraint if exists transactions_kind_check,
  drop constraint if exists transactions_envelope_taken_bani_check,
  drop constraint if exists transactions_sign;
alter table transactions
  add constraint transactions_kind_check check (kind in ('sale', 'expense')),
  add constraint transactions_envelope_taken_bani_check check (envelope_taken_bani >= 0),
  add constraint transactions_sign check (
    kind is null or (kind = 'sale' and amount_bani > 0) or (kind = 'expense' and amount_bani < 0)
  );

-- Tasks come from docs/data/calendar-2026.json. Only the finished ones are stored,
-- as "<event id>:<year>".
create table if not exists task_completions (
  farmer_id uuid not null references farmers(id) on delete cascade,
  task_id text not null,
  completed_at timestamptz not null default now(),
  primary key (farmer_id, task_id)
);
alter table task_completions enable row level security;
drop policy if exists task_completions_own on task_completions;
create policy task_completions_own on task_completions for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));
-- Since 30 October 2026, new public tables get no automatic grants.
grant select, insert, delete on table public.task_completions to authenticated;
grant select, insert, update, delete on table public.task_completions to service_role;

-- The money a farmer has: what they started with, plus everything they recorded.
create or replace function public.farmer_money(p_farmer uuid) returns bigint
  language sql stable security invoker set search_path = public
as $$
  select f.start_balance_bani + coalesce(
    (select sum(t.amount_bani) from transactions t where t.farmer_id = f.id and t.kind is not null), 0)
  from farmers f where f.id = p_farmer
$$;
revoke all on function public.farmer_money(uuid) from public, anon;
grant execute on function public.farmer_money(uuid) to authenticated;

-- Replaces 009: the split can now use recorded income too.
create or replace function public.set_envelopes(p_balances jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer farmers%rowtype;
  v_total bigint := 0;
  v_kind envelope_kind;
  v_value bigint;
begin
  select * into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;

  foreach v_kind in array enum_range(null::envelope_kind) loop
    v_value := coalesce((p_balances->>v_kind::text)::bigint, 0);
    if v_value < 0 then
      raise exception 'envelope % is negative', v_kind using errcode = '22023';
    end if;
    v_total := v_total + v_value;
  end loop;

  if v_total > public.farmer_money(v_farmer.id) then
    raise exception 'split exceeds available money' using errcode = '22023';
  end if;

  update envelopes e
     set balance_bani = coalesce((p_balances->>e.kind::text)::bigint, 0)
   where e.farmer_id = v_farmer.id;
end $$;

-- Saves an expense and takes it from an envelope in one go. A real expense is never refused:
-- if the envelope holds less, it gives what it has.
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_envelope is not null then
    select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
      from envelopes where farmer_id = v_farmer and kind = p_envelope for update;
    update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  end if;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note, envelope_taken_bani)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, p_crop_id, p_note, coalesce(v_taken, 0))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind) to authenticated;

-- Removes a recorded sale or expense and puts back what it took from its envelope.
-- Stripe transactions have no kind, so they can never be undone here.
create or replace function public.undo_transaction(p_id uuid) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where id = p_id and kind is not null for update;
  if not found then
    return false;
  end if;
  if v_tx.envelope_id is not null then
    update envelopes set balance_bani = balance_bani + v_tx.envelope_taken_bani where id = v_tx.envelope_id;
  end if;
  delete from transactions where id = p_id;
  return true;
end $$;
revoke all on function public.undo_transaction(uuid) from public, anon;
grant execute on function public.undo_transaction(uuid) to authenticated;

-- Replaces the farm's details and parcels in one go. The envelopes must still fit the money.
create or replace function public.update_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,  -- [{ "crop_id": "grau", "area_ari": 800 }, ...]
  p_start_balance_bani bigint
) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_parcel jsonb;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_parcels) <> 'array' or jsonb_array_length(p_parcels) = 0 then
    raise exception 'parcels must be a non-empty array' using errcode = '22023';
  end if;

  update farmers
     set name = p_name, county = p_county, birth_year = p_birth_year, start_balance_bani = p_start_balance_bani
   where id = v_farmer;

  if (select coalesce(sum(balance_bani), 0) from envelopes where farmer_id = v_farmer) > public.farmer_money(v_farmer) then
    raise exception 'envelopes exceed available money' using errcode = '22023';
  end if;

  delete from parcels where farmer_id = v_farmer;
  for v_parcel in select * from jsonb_array_elements(p_parcels) loop
    insert into parcels (farmer_id, crop_id, area_ari, is_arable)
    values (v_farmer, v_parcel->>'crop_id', (v_parcel->>'area_ari')::int, true);
  end loop;
end $$;
revoke all on function public.update_farm(text, text, int, jsonb, bigint) from public, anon;
grant execute on function public.update_farm(text, text, int, jsonb, bigint) to authenticated;
