-- 036: the SQL functions are told which farm, and check the caller's role on it (docs/workspaces-plan.md step 2).
-- Safe to run again.
--
-- Four functions found "my farm" by themselves (`from farmers where user_id = auth.uid()`). Each gets a version
-- that takes p_farmer_id first and starts with require_farm_role (035). Bodies are otherwise as before:
--
--   set_envelopes   as in 010        owner, manager
--   record_expense  as in 026        owner, manager   (a worker's fuel log is step 7, not an expense)
--   update_farm     as in 020        owner, manager
--   save_plots      as in 020        owner, manager
--
-- The old signatures stay, one line each, until the API sends the farm (step 3); they act on only_farm(): the one
-- farm where the caller is owner or manager, `no farm` (P0002) when none, `ambiguous_farm` when several. They go
-- in step 8. PostgREST tells the two apart by the argument names: only the new ones have p_farmer_id, and it has
-- no default.
--
-- Not changed, and why:
--   undo_transaction, update_farm_event, split_farm_event   act on a row id; RLS (my_farmer_ids, 035) already
--                                                            limits the row to farms where I'm owner or manager
--   farmer_money, farm_harvest_year, sync_unplaced_plots    already take the farm; RLS / the check in sync apply
--   take_farm_lease, release_farm_lease                     service key only
--   create_farm                                              makes a farm, doesn't act on one (step 4)
--   accept_farm_invite                                       step 6
--
-- Also: opportunity_follows (013) was the one policy still reading farmers.user_id; it now uses my_farmer_ids().

-- ── The caller's one farm, for the old signatures ─────────────────────────────────

create or replace function public.only_farm() returns uuid
  language plpgsql stable security invoker set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(f) into v_ids from public.my_farm_ids(array['owner', 'manager']) as f;
  if v_ids is null then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception 'several farms: say which one' using errcode = '22023', hint = 'ambiguous_farm';
  end if;
  return v_ids[1];
end $$;
revoke all on function public.only_farm() from public, anon;
grant execute on function public.only_farm() to authenticated;

-- ── set_envelopes ─────────────────────────────────────────────────────────────────

create or replace function public.set_envelopes(p_farmer_id uuid, p_balances jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_total bigint := 0;
  v_kind envelope_kind;
  v_value bigint;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);

  foreach v_kind in array enum_range(null::envelope_kind) loop
    v_value := coalesce((p_balances->>v_kind::text)::bigint, 0);
    if v_value < 0 then
      raise exception 'envelope % is negative', v_kind using errcode = '22023';
    end if;
    v_total := v_total + v_value;
  end loop;

  if v_total > public.farmer_money(p_farmer_id) then
    raise exception 'split exceeds available money' using errcode = '22023';
  end if;

  update envelopes e
     set balance_bani = coalesce((p_balances->>e.kind::text)::bigint, 0)
   where e.farmer_id = p_farmer_id;
end $$;
revoke all on function public.set_envelopes(uuid, jsonb) from public, anon;
grant execute on function public.set_envelopes(uuid, jsonb) to authenticated;

create or replace function public.set_envelopes(p_balances jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
begin
  perform public.set_envelopes(public.only_farm(), p_balances);
end $$;

-- ── record_expense ────────────────────────────────────────────────────────────────

create or replace function public.record_expense(
  p_farmer_id uuid,
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null,
  p_plot_id uuid default null,
  p_fertilizer_product_id text default null,
  p_fertilizer_qty int default null,
  p_fertilizer_unit text default null,
  p_employee_id uuid default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid := p_farmer_id;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
  v_crop text := p_crop_id;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_fertilizer_product_id is not null and p_category <> 'fertilizer' then
    raise exception 'a fertilizer goes on a fertilizer expense' using errcode = '22023';
  end if;
  if p_employee_id is not null and p_category <> 'salaries' then
    raise exception 'a person goes on a salaries expense' using errcode = '22023';
  end if;

  -- Sent before: return the saved row and take nothing from the envelope again.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    select id into v_id from transactions where farmer_id = v_farmer and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;

  if p_employee_id is not null then
    perform 1 from employees where id = p_employee_id and farmer_id = v_farmer;
    if not found then
      raise exception 'unknown employee' using errcode = 'P0002';
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
                            envelope_taken_bani, harvest_year, client_id, plot_id,
                            fertilizer_product_id, fertilizer_qty, fertilizer_unit, employee_id)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, v_crop, p_note, coalesce(v_taken, 0), p_harvest_year, p_client_id, p_plot_id,
          p_fertilizer_product_id, p_fertilizer_qty, p_fertilizer_unit, p_employee_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(uuid, bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text, uuid) from public, anon;
grant execute on function public.record_expense(uuid, bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text, uuid) to authenticated;

create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null,
  p_plot_id uuid default null,
  p_fertilizer_product_id text default null,
  p_fertilizer_qty int default null,
  p_fertilizer_unit text default null,
  p_employee_id uuid default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
begin
  return public.record_expense(
    p_farmer_id => public.only_farm(), p_amount_bani => p_amount_bani, p_date => p_date, p_category => p_category,
    p_crop_id => p_crop_id, p_note => p_note, p_envelope => p_envelope, p_harvest_year => p_harvest_year,
    p_client_id => p_client_id, p_plot_id => p_plot_id, p_fertilizer_product_id => p_fertilizer_product_id,
    p_fertilizer_qty => p_fertilizer_qty, p_fertilizer_unit => p_fertilizer_unit, p_employee_id => p_employee_id);
end $$;

-- ── update_farm ───────────────────────────────────────────────────────────────────

create or replace function public.update_farm(
  p_farmer_id uuid,
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,
  p_start_balance_bani bigint
) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid := p_farmer_id;
  v_parcel jsonb;
  v_months jsonb;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
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
revoke all on function public.update_farm(uuid, text, text, int, jsonb, bigint) from public, anon;
grant execute on function public.update_farm(uuid, text, text, int, jsonb, bigint) to authenticated;

create or replace function public.update_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,
  p_start_balance_bani bigint
) returns void
  language plpgsql security invoker set search_path = public
as $$
begin
  perform public.update_farm(public.only_farm(), p_name, p_county, p_birth_year, p_parcels, p_start_balance_bani);
end $$;

-- ── save_plots ────────────────────────────────────────────────────────────────────

create or replace function public.save_plots(p_farmer_id uuid, p_harvest_year int, p_plots jsonb) returns jsonb
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid := p_farmer_id;
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
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  select county into v_county from farmers where id = v_farmer;
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
revoke all on function public.save_plots(uuid, int, jsonb) from public, anon;
grant execute on function public.save_plots(uuid, int, jsonb) to authenticated;

create or replace function public.save_plots(p_harvest_year int, p_plots jsonb) returns jsonb
  language plpgsql security invoker set search_path = public
as $$
begin
  return public.save_plots(public.only_farm(), p_harvest_year, p_plots);
end $$;

-- ── The last policy that read farmers.user_id ─────────────────────────────────────

drop policy if exists opportunity_follows_own on public.opportunity_follows;
create policy opportunity_follows_own on public.opportunity_follows for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));
