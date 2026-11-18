-- 044: a parcel drawn on the phone without internet can wait in the queue (docs/cerere-documents-google-map-plan.md
-- step 7). The phone gives the new parcel its id, and save_plots makes the parcel with that id when no parcel has it
-- yet, instead of refusing it as unknown. Sent twice (the queue retries after a lost answer), the second save finds
-- the parcel and updates it: never two parcels for one drawing. Everything else is as in 036.
--
-- An id that belongs to another farm's parcel isn't visible here (RLS), so the insert meets the primary key and
-- fails with 23505 (409 already_saved in the API): it never touches the other farm's parcel.

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
  v_new boolean;
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

    -- An id no parcel has yet is one the phone made for a parcel drawn without internet (044): the parcel
    -- is made with it, so the same save sent again finds it and changes it instead of making a second one.
    v_new := v_plot is not null and not exists (select 1 from plots where id = v_plot);

    if v_plot is null or v_new then
      insert into plots (id, farmer_id, county, name, siruta, village_siruta, bloc_fizic, parcel_no, lpis_fbid, land_use,
                         geometry, shape, centroid_lat, centroid_lng, geometry_source)
      values (coalesce(v_plot, gen_random_uuid()), v_farmer, coalesce(v_item->>'county', v_county), v_item->>'name', (v_item->>'siruta')::int,
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
