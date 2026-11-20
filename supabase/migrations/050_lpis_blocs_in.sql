-- 050_lpis_blocs_in.sql — the blocs in one square of the map, for the „Blocuri APIA” outlines on /harta
-- (docs/harta-plan.md). The API asks for one square of its zoom-14 grid at a time (packages/shared/src/plots/
-- lpis-tiles.ts) and falls back to APIA when this answers nothing, so it is safe before lpis_blocs is filled.
-- Outlines are simplified to about a metre, like the question the API asks APIA. Safe to run again.

create or replace function public.lpis_blocs_in(p_west double precision, p_south double precision, p_east double precision, p_north double precision)
  returns jsonb
  language sql stable security invoker set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(j), '[]'::jsonb) from (
    select public.lpis_bloc_json(b) || jsonb_build_object('geometry', st_asgeojson(st_simplifypreservetopology(b.geom, 0.00001), 6)::jsonb) as j
      from public.lpis_blocs b
     where b.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
       and st_intersects(b.geom, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
       -- One square of the grid is about 1,8 km a side; anything much larger is a wrong question.
       and p_east - p_west <= 0.1 and p_north - p_south <= 0.1
     order by b.fbid
     limit 1000
  ) x
$$;

grant execute on function public.lpis_blocs_in(double precision, double precision, double precision, double precision) to authenticated, service_role;
revoke execute on function public.lpis_blocs_in(double precision, double precision, double precision, double precision) from anon;
