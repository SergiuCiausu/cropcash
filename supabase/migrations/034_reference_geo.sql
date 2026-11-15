-- 034_reference_geo.sql — a local copy of SIRUTA and APIA's blocuri fizice for Teleorman and Constanța
-- (docs/harta-plan.md, step 1b; the plan called it 021, which another migration took). Public reference
-- data: signed-in users read it, only the service role (the import scripts) writes it. PostGIS here,
-- unlike `plots`, because these tables are searched by place. Safe to run again.
--
-- plots.siruta and plots.lpis_fbid stay plain columns, not foreign keys, so a farm in another county works.
-- APIA's terms for a bulk copy are still open (docs/harta-plan.md, open question 1): fill lpis_blocs only in
-- a dev database until they're answered.

create extension if not exists postgis with schema extensions;

create table if not exists public.siruta_units (
  siruta int primary key,
  name text not null,                    -- written properly: „Măldăeni” (INS publishes capitals)
  name_ins text not null,                -- DENLOC, as INS publishes it
  name_search text not null,             -- small letters, no diacritics, for the search box
  tip int not null,                      -- INS TIP (docs/data/siruta-types.json)
  kind text not null check (kind in ('county','municipality','town','commune','village','component_locality','sector')),
  seat boolean not null default false,
  county text not null check (county ~ '^[A-Z]{1,2}$'),
  parent_siruta int,                     -- SIRSUP: village → commune → county
  commune_siruta int,                    -- the commune/town/municipality it belongs to; itself for one of those
  urban boolean not null,
  location extensions.geometry(Point, 4326),        -- the village's or town's point (OpenStreetMap, siruta:code)
  boundary extensions.geometry(MultiPolygon, 4326), -- UAT outline (ANCPI), not imported yet
  centroid extensions.geometry(Point, 4326),        -- middle of the UAT's blocs, filled by geo_fill_places
  source_version text not null           -- e.g. 'SIRUTA s1 2026'
);
create index if not exists siruta_units_county_name on public.siruta_units (county, name_search);
create index if not exists siruta_units_commune on public.siruta_units (commune_siruta);
create index if not exists siruta_units_location on public.siruta_units using gist (location);

create table if not exists public.lpis_blocs (
  fbid text primary key check (fbid ~ '^\d{1,6}-[0-9A-Za-z/]{1,20}$'),
  siruta int not null,                   -- the code LPIS gives (usually the commune's)
  bloc_no text generated always as (split_part(fbid, '-', 2)) stored,
  county text not null,
  uat_name text not null,                -- nume_com, as APIA writes it
  land_use text,                         -- fol_pr_trn: TA, PP, CP, VI…
  land_use_2 text,                       -- fol_sec_tr
  net_area_m2 bigint not null check (net_area_m2 >= 0),   -- aria_neta (ha) × 10 000, rounded: no floats
  uat_siruta int,                        -- the commune/town the bloc belongs to, through siruta_units
  village_siruta int,                    -- the village it lies by (docs/harta-plan.md, „Places”)
  village_method text check (village_method in ('only_village','inside_locality','nearest','paper')),
  village_distance_m int,                -- bloc middle → that village's point; 0 inside it
  geom extensions.geometry(MultiPolygon, 4326) not null,
  layer_year int not null,               -- 2024; a bloc gone from a newer layer keeps its old year
  imported_at timestamptz not null default now()
);
create index if not exists lpis_blocs_geom on public.lpis_blocs using gist (geom);
create index if not exists lpis_blocs_no on public.lpis_blocs (siruta, bloc_no);
create index if not exists lpis_blocs_uat_no on public.lpis_blocs (uat_siruta, bloc_no);

alter table public.siruta_units enable row level security;
alter table public.lpis_blocs enable row level security;
drop policy if exists siruta_units_read on public.siruta_units;
create policy siruta_units_read on public.siruta_units for select to authenticated using (true);
drop policy if exists lpis_blocs_read on public.lpis_blocs;
create policy lpis_blocs_read on public.lpis_blocs for select to authenticated using (true);
revoke insert, update, delete on public.siruta_units, public.lpis_blocs from anon, authenticated;

-- One readable line per code: „satul Măldăeni, comuna Măldăeni” (the app builds the same from
-- docs/data/siruta-tr-ct.json, so it works offline).
create or replace view public.siruta_places with (security_invoker = true) as
select u.siruta, u.name, u.kind, u.county, c.siruta as commune_siruta, c.name as commune_name, c.kind as commune_kind,
       extensions.st_y(u.location) as lat, extensions.st_x(u.location) as lng
  from public.siruta_units u left join public.siruta_units c on c.siruta = u.commune_siruta;

-- ── Reads for the API (an LpisSource, apps/api/src/lpis/db.ts) ──────────────────────────────────────

-- A bloc as the API answers it: GeoJSON outline, hectares as ari, and where it is.
create or replace function public.lpis_bloc_json(b public.lpis_blocs) returns jsonb
  language sql stable set search_path = public, extensions
as $$
  select jsonb_build_object(
    'fbid', b.fbid, 'siruta', b.siruta, 'bloc', b.bloc_no, 'county', b.county, 'commune', nullif(b.uat_name, ''),
    'landUse', b.land_use, 'netAreaAri', round(b.net_area_m2 / 100.0)::int,
    'geometry', st_asgeojson(b.geom, 6)::jsonb,
    'uatSiruta', b.uat_siruta, 'villageSiruta', b.village_siruta, 'villageMethod', b.village_method,
    'villageDistanceM', b.village_distance_m, 'layerYear', b.layer_year)
$$;

-- A bloc by the code and number on the paper. The code may be the village's while LPIS has the commune's,
-- so the commune of the code is tried too.
create or replace function public.lpis_bloc(p_siruta int, p_bloc text) returns jsonb
  language sql stable security invoker set search_path = public, extensions
as $$
  select public.lpis_bloc_json(b) from public.lpis_blocs b
   where b.bloc_no = p_bloc
     and (b.siruta = p_siruta or b.uat_siruta = p_siruta
          or b.uat_siruta = (select commune_siruta from public.siruta_units where siruta = p_siruta))
   order by (b.siruta = p_siruta) desc, b.layer_year desc
   limit 1
$$;

create or replace function public.lpis_blocs_at(p_lng double precision, p_lat double precision) returns jsonb
  language sql stable security invoker set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(public.lpis_bloc_json(b) order by b.net_area_m2), '[]'::jsonb)
    from public.lpis_blocs b
   where st_intersects(b.geom, st_setsrid(st_point(p_lng, p_lat), 4326))
$$;

-- The communes, towns and municipalities of a county that have blocs, by name.
create or replace function public.siruta_communes(p_county text) returns jsonb
  language sql stable security invoker set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object('siruta', u.siruta, 'name', u.name) order by u.name), '[]'::jsonb)
    from public.siruta_units u
   where u.county = upper(p_county) and u.kind in ('commune','town','municipality')
     and exists (select 1 from public.lpis_blocs b where b.uat_siruta = u.siruta)
$$;

create or replace function public.siruta_commune_centre(p_siruta int) returns jsonb
  language sql stable security invoker set search_path = public, extensions
as $$
  select case when u.centroid is null then null else jsonb_build_array(round(st_x(u.centroid)::numeric, 6), round(st_y(u.centroid)::numeric, 6)) end
    from public.siruta_units u where u.siruta = p_siruta
$$;

grant execute on function public.lpis_bloc(int, text), public.lpis_blocs_at(double precision, double precision),
  public.siruta_communes(text), public.siruta_commune_centre(int), public.lpis_bloc_json(public.lpis_blocs) to authenticated, service_role;
revoke execute on function public.lpis_bloc(int, text), public.lpis_blocs_at(double precision, double precision),
  public.siruta_communes(text), public.siruta_commune_centre(int) from anon;

-- ── After an import: which commune and village each bloc points to (service role only) ──────────────
-- The same rules as packages/shared/src/plots/village.ts, without inside_locality, which needs the villages'
-- built-up outlines (not imported yet). Cheap to run again for a county.
create or replace function public.geo_fill_places(p_county text) returns jsonb
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_counts jsonb;
begin
  -- The bloc's commune: its own code when that is a UAT, else the UAT above that code.
  update public.lpis_blocs b set uat_siruta = u.commune_siruta
    from public.siruta_units u
   where b.county = p_county and u.siruta = b.siruta;

  -- One village in the commune: that one.
  with single as (
    select commune_siruta, min(siruta) as village, (array_agg(location))[1] as location
      from public.siruta_units where county = p_county and kind in ('village','component_locality')
     group by commune_siruta having count(*) = 1)
  update public.lpis_blocs b set village_siruta = o.village, village_method = 'only_village',
         village_distance_m = case when o.location is null then null
                                   when st_intersects(b.geom, o.location) then 0
                                   else round(st_distance(st_centroid(b.geom)::geography, o.location::geography))::int end
    from single o
   where b.county = p_county and b.uat_siruta = o.commune_siruta;

  -- Otherwise the commune's village nearest to the bloc's middle.
  with near as (
    select b.fbid, n.siruta, n.d
      from public.lpis_blocs b
     cross join lateral (
       select v.siruta, round(st_distance(st_centroid(b.geom)::geography, v.location::geography))::int as d
         from public.siruta_units v
        where v.commune_siruta = b.uat_siruta and v.kind in ('village','component_locality') and v.location is not null
        order by st_centroid(b.geom)::geography <-> v.location::geography
        limit 1) n
     where b.county = p_county and b.village_method is distinct from 'only_village')
  update public.lpis_blocs b set village_siruta = near.siruta, village_method = 'nearest', village_distance_m = near.d
    from near where b.fbid = near.fbid;

  -- The middle of each UAT's blocs, to place a parcel roughly when its bloc isn't found.
  update public.siruta_units u set centroid = c.centre
    from (select uat_siruta, st_centroid(st_collect(geom)) as centre from public.lpis_blocs
           where county = p_county and uat_siruta is not null group by uat_siruta) c
   where u.siruta = c.uat_siruta;

  select jsonb_object_agg(coalesce(village_method, 'none'), n) into v_counts
    from (select village_method, count(*) as n from public.lpis_blocs where county = p_county group by village_method) x;
  return coalesce(v_counts, '{}'::jsonb);
end $$;
revoke all on function public.geo_fill_places(text) from public, anon, authenticated;
grant execute on function public.geo_fill_places(text) to service_role;
