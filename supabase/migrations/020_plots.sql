-- 020: parcels as pieces of land (docs/harta-plan.md, step 1). Safe to run again.
--
-- plots          a piece of land, stable across years
-- plot_seasons   what grows on it in one harvest year (= the APIA campaign year; Recolta 2027 runs
--                from November 2026, like harvestYear in packages/shared)
-- plot_operations work done or planned on it (treatments, sowing, harvest…)
--
-- parcels (one row per crop) stays the farm plan's input: the crop totals of the plan's harvest year.
-- It always equals the sum of that year's plot_seasons. Hectares of a crop not yet on the map sit on
-- one "unplaced" plot per crop (auto_crop_id). Same rules as packages/shared/src/plots/totals.ts.
-- Every function is SECURITY INVOKER, so RLS applies to each read and write.

-- ── Tables ─────────────────────────────────────────────────────────────────────

create table if not exists public.plots (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  name text check (char_length(name) between 1 and 80),
  county text not null check (char_length(county) between 1 and 40),
  siruta int check (siruta > 0),
  village_siruta int check (village_siruta > 0),
  bloc_fizic text check (char_length(bloc_fizic) between 1 and 20),
  parcel_no text check (char_length(parcel_no) between 1 and 10),
  lpis_fbid text check (lpis_fbid ~ '^\d+-[0-9A-Za-z/]+$'),
  land_use text check (char_length(land_use) between 1 and 10),
  geometry jsonb check (
    geometry is null or (
      jsonb_typeof(geometry) = 'object'
      and geometry->>'type' in ('Polygon', 'MultiPolygon')
      and jsonb_typeof(geometry->'coordinates') = 'array'
      and octet_length(geometry::text) <= 65536
    )
  ),
  shape jsonb check (shape is null or (jsonb_typeof(shape) = 'object' and octet_length(shape::text) <= 65536)),
  centroid_lat numeric(9, 6) check (centroid_lat between -90 and 90),
  centroid_lng numeric(9, 6) check (centroid_lng between -180 and 180),
  geometry_source text not null default 'none'
    check (geometry_source in ('lpis', 'drawn', 'coords', 'approx', 'none')),
  auto_crop_id text check (char_length(auto_crop_id) between 1 and 40),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, farmer_id),
  check ((centroid_lat is null) = (centroid_lng is null)),
  check (geometry_source = 'none' or geometry is not null or geometry_source = 'approx'),
  -- The unplaced plot of a crop is never on the map: placing land makes a real plot.
  check (auto_crop_id is null or (geometry is null and geometry_source = 'none'))
);
create index if not exists plots_farmer on public.plots (farmer_id);
create unique index if not exists plots_auto_crop on public.plots (farmer_id, auto_crop_id) where auto_crop_id is not null;
create unique index if not exists plots_apia_key on public.plots (farmer_id, siruta, bloc_fizic, parcel_no)
  where siruta is not null and bloc_fizic is not null and parcel_no is not null and archived_at is null;

create table if not exists public.plot_seasons (
  plot_id uuid not null,
  farmer_id uuid not null,
  harvest_year int not null check (harvest_year between 2000 and 2100),
  crop_id text check (char_length(crop_id) between 1 and 40),
  apia_crop_code int check (apia_crop_code > 0),
  area_ari int not null check (area_ari > 0 and area_ari <= 100000),
  sown_on date,
  harvested_on date,
  second_crop_id text check (char_length(second_crop_id) between 1 and 40),
  primary key (plot_id, harvest_year),
  -- The season's farm is the plot's farm, so a season can't point at someone else's land.
  foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete cascade,
  check (harvested_on is null or sown_on is null or harvested_on >= sown_on)
);
create index if not exists plot_seasons_farmer_year on public.plot_seasons (farmer_id, harvest_year);

-- Lets operations and transactions point at a transaction of the same farm only.
create unique index if not exists transactions_id_farmer on public.transactions (id, farmer_id);

create table if not exists public.plot_operations (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null,
  farmer_id uuid not null,
  harvest_year int not null check (harvest_year between 2000 and 2100),
  kind text not null check (kind in ('soil_work', 'sowing', 'fertilizing', 'herbicide', 'fungicide',
                                     'insecticide', 'irrigation', 'harvest', 'other')),
  status text not null check (status in ('done', 'planned')),
  on_date date,
  product text check (char_length(product) between 1 and 120),
  dose text check (char_length(dose) between 1 and 60),
  note text check (char_length(note) between 1 and 200),
  transaction_id uuid,
  template_id text check (char_length(template_id) between 1 and 60),
  -- Set by the phone before the first send, so an operation queued offline is saved once.
  client_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete cascade,
  foreign key (transaction_id, farmer_id) references public.transactions (id, farmer_id) on delete set null (transaction_id),
  check (status = 'planned' or on_date is not null)
);
create index if not exists plot_operations_plot_year on public.plot_operations (plot_id, harvest_year);
create index if not exists plot_operations_farmer on public.plot_operations (farmer_id);

alter table public.transactions add column if not exists plot_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_plot_fk') then
    alter table public.transactions add constraint transactions_plot_fk
      foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete set null (plot_id);
  end if;
end $$;
create index if not exists transactions_plot on public.transactions (plot_id) where plot_id is not null;

-- ── Access ─────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['plots', 'plot_seasons', 'plot_operations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (farmer_id in (select public.my_farmer_ids()))
         with check (farmer_id in (select public.my_farmer_ids()))',
      t || '_own', t);
    -- Since 30 October 2026, new public tables get no automatic grants.
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- ── The plan's harvest year ────────────────────────────────────────────────────

-- The demo clock's date when it's set, otherwise today in Romania. November starts the next harvest.
create or replace function public.farm_harvest_year(p_farmer uuid) returns int
  language sql stable security invoker set search_path = public
as $$
  select extract(year from d)::int + case when extract(month from d) >= 11 then 1 else 0 end
    from (select (coalesce(demo_now, now()) at time zone 'Europe/Bucharest') as d from farmers where id = p_farmer) x
$$;
revoke all on function public.farm_harvest_year(uuid) from public, anon;
grant execute on function public.farm_harvest_year(uuid) to authenticated, service_role;

-- ── parcels → plots: the crop totals moved onto unplaced plots ─────────────────

-- Makes the plan year's plot_seasons add up to parcels, changing only the unplaced plots.
-- Refuses a crop total smaller than what's already on the map, and a crop removed while on the map.
create or replace function public.sync_unplaced_plots(p_farmer uuid) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_year int;
  v_county text;
  r record;
  v_placed int;
  v_plot uuid;
begin
  if auth.uid() is not null and p_farmer not in (select public.my_farmer_ids()) then
    raise exception 'not your farm' using errcode = '42501';
  end if;
  select county into v_county from farmers where id = p_farmer;
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  v_year := public.farm_harvest_year(p_farmer);

  select s.crop_id into r from plot_seasons s join plots p on p.id = s.plot_id
   where s.farmer_id = p_farmer and s.harvest_year = v_year and p.auto_crop_id is null and s.crop_id is not null
     and not exists (select 1 from parcels x where x.farmer_id = p_farmer and x.crop_id = s.crop_id)
   limit 1;
  if found then
    raise exception 'crop % is on the map', r.crop_id using errcode = '22023', hint = 'removed_but_mapped';
  end if;

  delete from plot_seasons s using plots p
   where p.id = s.plot_id and p.farmer_id = p_farmer and s.harvest_year = v_year and p.auto_crop_id is not null
     and not exists (select 1 from parcels x where x.farmer_id = p_farmer and x.crop_id = p.auto_crop_id);

  for r in select crop_id, sum(area_ari)::int as area from parcels where farmer_id = p_farmer group by crop_id loop
    select coalesce(sum(s.area_ari), 0)::int into v_placed
      from plot_seasons s join plots p on p.id = s.plot_id
     where s.farmer_id = p_farmer and s.harvest_year = v_year and s.crop_id = r.crop_id and p.auto_crop_id is null;
    if r.area < v_placed then
      raise exception 'crop % is smaller than its parcels on the map', r.crop_id using errcode = '22023', hint = 'below_mapped';
    end if;

    if r.area = v_placed then
      delete from plot_seasons s using plots p
       where p.id = s.plot_id and p.farmer_id = p_farmer and p.auto_crop_id = r.crop_id and s.harvest_year = v_year;
    else
      insert into plots (farmer_id, county, auto_crop_id) values (p_farmer, v_county, r.crop_id)
        on conflict (farmer_id, auto_crop_id) where auto_crop_id is not null do update set county = excluded.county
        returning id into v_plot;
      insert into plot_seasons (plot_id, farmer_id, harvest_year, crop_id, area_ari)
        values (v_plot, p_farmer, v_year, r.crop_id, r.area - v_placed)
        on conflict (plot_id, harvest_year) do update set area_ari = excluded.area_ari, crop_id = excluded.crop_id;
    end if;
  end loop;

  -- An unplaced plot with nothing left on it, in any year, goes.
  delete from plots p where p.farmer_id = p_farmer and p.auto_crop_id is not null
     and not exists (select 1 from plot_seasons s where s.plot_id = p.id)
     and not exists (select 1 from plot_operations o where o.plot_id = p.id)
     and not exists (select 1 from transactions t where t.plot_id = p.id);
end $$;
revoke all on function public.sync_unplaced_plots(uuid) from public, anon;
grant execute on function public.sync_unplaced_plots(uuid) to authenticated, service_role;

-- jsonb null and a missing key both mean "no value".
create or replace function public.json_or_null(p jsonb) returns jsonb
  language sql immutable set search_path = public
as $$ select case when p is null or jsonb_typeof(p) = 'null' then null else p end $$;

-- Saves parcels from the map or from a cerere: [{ id?, name?, siruta?, bloc_fizic?, parcel_no?, …,
-- season?: { crop_id, area_ari, … } | null }]. Without an id, a live plot with the same SIRUTA, bloc
-- and number is reused. A key left out keeps its value. season null = nothing grows there that year.
-- In the plan's year, newly placed hectares of a crop come out of its unplaced plot first, and the
-- crop totals in parcels are rewritten from the seasons. Returns the plot ids in order.
create or replace function public.save_plots(p_harvest_year int, p_plots jsonb) returns jsonb
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_county text;
  v_year int;
  v_item jsonb;
  v_season jsonb;
  v_plot uuid;
  v_ids jsonb := '[]'::jsonb;
  v_before jsonb;
  v_months jsonb;
  r record;
  v_grown int;
begin
  select id, county into v_farmer, v_county from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_plots) <> 'array' or jsonb_array_length(p_plots) = 0 or jsonb_array_length(p_plots) > 500 then
    raise exception 'plots must be an array of 1 to 500' using errcode = '22023';
  end if;
  v_year := public.farm_harvest_year(v_farmer);

  -- Placed hectares per crop before the save.
  select coalesce(jsonb_object_agg(crop_id, area), '{}'::jsonb) into v_before from (
    select s.crop_id, sum(s.area_ari)::int as area from plot_seasons s join plots p on p.id = s.plot_id
     where s.farmer_id = v_farmer and s.harvest_year = p_harvest_year and p.auto_crop_id is null and s.crop_id is not null
     group by s.crop_id) x;

  for v_item in select * from jsonb_array_elements(p_plots) loop
    v_plot := nullif(v_item->>'id', '')::uuid;
    if v_plot is null and v_item->>'siruta' is not null and v_item->>'bloc_fizic' is not null and v_item->>'parcel_no' is not null then
      select id into v_plot from plots
       where farmer_id = v_farmer and archived_at is null and auto_crop_id is null
         and siruta = (v_item->>'siruta')::int and bloc_fizic = v_item->>'bloc_fizic' and parcel_no = v_item->>'parcel_no';
    end if;

    if v_plot is null then
      insert into plots (farmer_id, county, name, siruta, village_siruta, bloc_fizic, parcel_no, lpis_fbid, land_use,
                         geometry, shape, centroid_lat, centroid_lng, geometry_source)
      values (v_farmer, coalesce(v_item->>'county', v_county), v_item->>'name', (v_item->>'siruta')::int,
              (v_item->>'village_siruta')::int, v_item->>'bloc_fizic', v_item->>'parcel_no', v_item->>'lpis_fbid',
              v_item->>'land_use', public.json_or_null(v_item->'geometry'), public.json_or_null(v_item->'shape'),
              (v_item->>'centroid_lat')::numeric, (v_item->>'centroid_lng')::numeric,
              coalesce(v_item->>'geometry_source', 'none'))
      returning id into v_plot;
    else
      update plots set
        name = case when v_item ? 'name' then v_item->>'name' else name end,
        county = coalesce(v_item->>'county', county),
        siruta = case when v_item ? 'siruta' then (v_item->>'siruta')::int else siruta end,
        village_siruta = case when v_item ? 'village_siruta' then (v_item->>'village_siruta')::int else village_siruta end,
        bloc_fizic = case when v_item ? 'bloc_fizic' then v_item->>'bloc_fizic' else bloc_fizic end,
        parcel_no = case when v_item ? 'parcel_no' then v_item->>'parcel_no' else parcel_no end,
        lpis_fbid = case when v_item ? 'lpis_fbid' then v_item->>'lpis_fbid' else lpis_fbid end,
        land_use = case when v_item ? 'land_use' then v_item->>'land_use' else land_use end,
        geometry = case when v_item ? 'geometry' then public.json_or_null(v_item->'geometry') else geometry end,
        shape = case when v_item ? 'shape' then public.json_or_null(v_item->'shape') else shape end,
        centroid_lat = case when v_item ? 'centroid_lat' then (v_item->>'centroid_lat')::numeric else centroid_lat end,
        centroid_lng = case when v_item ? 'centroid_lng' then (v_item->>'centroid_lng')::numeric else centroid_lng end,
        geometry_source = coalesce(v_item->>'geometry_source', geometry_source)
      where id = v_plot and farmer_id = v_farmer and auto_crop_id is null;
      if not found then
        raise exception 'unknown parcel' using errcode = 'P0002';
      end if;
    end if;

    if v_item ? 'season' then
      v_season := v_item->'season';
      if jsonb_typeof(v_season) = 'null' then
        delete from plot_seasons where plot_id = v_plot and harvest_year = p_harvest_year;
      else
        insert into plot_seasons (plot_id, farmer_id, harvest_year, crop_id, apia_crop_code, area_ari, sown_on, harvested_on, second_crop_id)
        values (v_plot, v_farmer, p_harvest_year, v_season->>'crop_id', (v_season->>'apia_crop_code')::int,
                (v_season->>'area_ari')::int, (v_season->>'sown_on')::date, (v_season->>'harvested_on')::date,
                v_season->>'second_crop_id')
        on conflict (plot_id, harvest_year) do update set
          crop_id = excluded.crop_id, apia_crop_code = excluded.apia_crop_code, area_ari = excluded.area_ari,
          sown_on = excluded.sown_on, harvested_on = excluded.harvested_on, second_crop_id = excluded.second_crop_id;
      end if;
    end if;
    v_ids := v_ids || to_jsonb(v_plot);
  end loop;

  if p_harvest_year = v_year then
    -- Newly placed hectares come out of the crop's unplaced plot.
    for r in
      select s.crop_id, sum(s.area_ari)::int as area from plot_seasons s join plots p on p.id = s.plot_id
       where s.farmer_id = v_farmer and s.harvest_year = v_year and p.auto_crop_id is null and s.crop_id is not null
       group by s.crop_id
    loop
      v_grown := r.area - coalesce((v_before->>r.crop_id)::int, 0);
      if v_grown > 0 then
        delete from plot_seasons s using plots p
         where p.id = s.plot_id and p.farmer_id = v_farmer and p.auto_crop_id = r.crop_id
           and s.harvest_year = v_year and s.area_ari <= v_grown;
        update plot_seasons s set area_ari = s.area_ari - v_grown from plots p
         where p.id = s.plot_id and p.farmer_id = v_farmer and p.auto_crop_id = r.crop_id
           and s.harvest_year = v_year;
      end if;
    end loop;

    -- The crop totals follow the seasons. A crop keeps its planting month.
    select coalesce(jsonb_object_agg(crop_id, planted_month) filter (where planted_month is not null), '{}'::jsonb)
      into v_months from parcels where farmer_id = v_farmer;
    delete from parcels where farmer_id = v_farmer;
    insert into parcels (farmer_id, crop_id, area_ari, is_arable, planted_month)
    select v_farmer, s.crop_id, sum(s.area_ari)::int, true,
           coalesce(v_months->>s.crop_id, to_char(min(s.sown_on), 'YYYY-MM'))
      from plot_seasons s where s.farmer_id = v_farmer and s.harvest_year = v_year and s.crop_id is not null
     group by s.crop_id;
    if not found then
      raise exception 'the farm needs at least one crop' using errcode = '22023';
    end if;

    delete from plots p where p.farmer_id = v_farmer and p.auto_crop_id is not null
       and not exists (select 1 from plot_seasons s where s.plot_id = p.id)
       and not exists (select 1 from plot_operations o where o.plot_id = p.id)
       and not exists (select 1 from transactions t where t.plot_id = p.id);
  end if;
  return v_ids;
end $$;
revoke all on function public.save_plots(int, jsonb) from public, anon;
grant execute on function public.save_plots(int, jsonb) to authenticated;

-- ── The farm's own functions keep the plots in step ────────────────────────────
-- Bodies as in 014, plus the last line.

create or replace function public.create_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,
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

  perform public.sync_unplaced_plots(v_farmer_id);
  return v_farmer_id;
end $$;

create or replace function public.update_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,
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

  perform public.sync_unplaced_plots(v_farmer);
end $$;

-- ── Expenses on a parcel ───────────────────────────────────────────────────────
-- As in 018, plus p_plot_id. Given a parcel and no crop, the crop is the one growing there that
-- harvest year. The old signature goes, so PostgREST sees one record_expense.

drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid);
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null,
  p_plot_id uuid default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
  v_crop text := p_crop_id;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  -- Sent before: return the saved row and take nothing from the envelope again.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    select id into v_id from transactions where farmer_id = v_farmer and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;

  if p_plot_id is not null then
    perform 1 from plots where id = p_plot_id and farmer_id = v_farmer;
    if not found then
      raise exception 'unknown parcel' using errcode = 'P0002';
    end if;
    if v_crop is null then
      select crop_id into v_crop from plot_seasons
       where plot_id = p_plot_id
         and harvest_year = coalesce(p_harvest_year,
               extract(year from p_date)::int + case when extract(month from p_date) >= 11 then 1 else 0 end);
    end if;
  end if;

  if p_envelope is not null then
    select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
      from envelopes where farmer_id = v_farmer and kind = p_envelope for update;
    update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  end if;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note,
                            envelope_taken_bani, harvest_year, client_id, plot_id)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, v_crop, p_note, coalesce(v_taken, 0), p_harvest_year, p_client_id, p_plot_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid) to authenticated;

-- ── Existing farms: each crop's hectares become its unplaced plot ──────────────

do $$
declare f uuid;
begin
  for f in select distinct farmer_id from parcels loop
    perform public.sync_unplaced_plots(f);
  end loop;
end $$;
