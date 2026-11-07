-- Onboarding now also asks how much money the farmer has today (optional, default 0).
drop function public.create_farm(text, text, int, jsonb);

create function public.create_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,                 -- [{ "crop_id": "grau", "area_ari": 800 }, ...]
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
    insert into parcels (farmer_id, crop_id, area_ari, is_arable)
    values (v_farmer_id, v_parcel->>'crop_id', (v_parcel->>'area_ari')::int, true);
  end loop;

  insert into envelopes (farmer_id, kind)
  select v_farmer_id, k from unnest(enum_range(null::envelope_kind)) as k;

  return v_farmer_id;
end $$;

revoke all on function public.create_farm(text, text, int, jsonb, bigint) from public, anon;
grant execute on function public.create_farm(text, text, int, jsonb, bigint) to authenticated;
