-- Storage for harvest years, so farm-app stops keeping them only in the browser. Safe to run again.

-- The farm's harvest years, closed crops and gathered grain (HarvestsInputSchema). Records stay in
-- transactions. Null means the farm hasn't saved any yet.
alter table farmers add column if not exists harvests jsonb
  check (harvests is null or (jsonb_typeof(harvests) = 'object' and octet_length(harvests::text) <= 262144));
-- Only farmers' own planning: nothing here moves money.
grant update (harvests) on table public.farmers to authenticated;

-- 'YYYY-MM'. Null means the farmer didn't say, so the crop's usual month applies.
alter table parcels add column if not exists planted_month text
  check (planted_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Set when a record belongs to another harvest than its date says, such as last year's grain sold
-- this spring. Null means the date decides (harvestYear in packages/shared).
alter table transactions add column if not exists harvest_year int
  check (harvest_year between 2000 and 2100);

create or replace function public.create_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,                 -- [{ "crop_id": "grau", "area_ari": 800, "planted_month": "2026-10" }, ...]
  p_start_balance_bani bigint default 0
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer_id uuid;
  v_parcel jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_parcels) <> 'array' or jsonb_array_length(p_parcels) = 0 then
    raise exception 'parcels must be a non-empty array' using errcode = '22023';
  end if;
  if p_start_balance_bani < 0 then
    raise exception 'start balance must be >= 0' using errcode = '22023';
  end if;

  insert into farmers (user_id, name, birth_year, county, start_balance_bani)
  values (auth.uid(), p_name, p_birth_year, p_county, p_start_balance_bani)
  returning id into v_farmer_id;

  for v_parcel in select * from jsonb_array_elements(p_parcels) loop
    insert into parcels (farmer_id, crop_id, area_ari, is_arable, planted_month)
    values (v_farmer_id, v_parcel->>'crop_id', (v_parcel->>'area_ari')::int, true, v_parcel->>'planted_month');
  end loop;

  insert into envelopes (farmer_id, kind)
  select v_farmer_id, k from unnest(enum_range(null::envelope_kind)) as k;

  return v_farmer_id;
end $$;

-- Parcels are replaced on every edit. A crop keeps its planting month unless the edit sends a new
-- one, because not every screen asks for it.
create or replace function public.update_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,  -- [{ "crop_id": "grau", "area_ari": 800, "planted_month": "2026-10" }, ...]
  p_start_balance_bani bigint
) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_parcel jsonb;
  v_months jsonb;
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

  select coalesce(jsonb_object_agg(crop_id, planted_month) filter (where planted_month is not null), '{}')
    into v_months from parcels where farmer_id = v_farmer;

  delete from parcels where farmer_id = v_farmer;
  for v_parcel in select * from jsonb_array_elements(p_parcels) loop
    insert into parcels (farmer_id, crop_id, area_ari, is_arable, planted_month)
    values (v_farmer, v_parcel->>'crop_id', (v_parcel->>'area_ari')::int, true,
            coalesce(v_parcel->>'planted_month', v_months->>(v_parcel->>'crop_id')));
  end loop;
end $$;

drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind);
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null
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

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note, envelope_taken_bani, harvest_year)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, p_crop_id, p_note, coalesce(v_taken, 0), p_harvest_year)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind, int) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind, int) to authenticated;
