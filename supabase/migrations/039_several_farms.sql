-- 039: one person, several farms (docs/workspaces-plan.md, step 4). Safe to run again.
--
--   farmers_user_id_key   dropped: user_id is now the farm's creator, not "the one farm of this person".
--                         Who runs a farm is farm_members (035); the creator's owner row comes from the
--                         farm_owner_on_create trigger, so create_farm needs no change for that.
--   farmers.client_id     the phone's id for a new farm. The unique key used to stop a repeated
--                         onboarding tap from making a second farm; this does it now.
--   create_farm(…, p_client_id)
--                         the same farm back for the same client id. The old signature is dropped, not
--                         kept beside it: with a default on the new argument PostgREST couldn't tell
--                         the two apart.
--   my_farms()            every farm I'm on, with my role, for the picker (/ferme).

-- ── Several farms per person ──────────────────────────────────────────────────────

alter table public.farmers drop constraint if exists farmers_user_id_key;
-- farmers_own (user_id = auth.uid()) still reads by creator, and lost its index with the constraint.
create index if not exists farmers_user_id on public.farmers (user_id);

alter table public.farmers add column if not exists client_id uuid;
create unique index if not exists farmers_client_id on public.farmers (user_id, client_id) where client_id is not null;
-- farmers grants column by column (012, 028): create_farm runs as the farmer, so it needs this column too.
grant select (client_id), insert (client_id) on public.farmers to authenticated;

-- ── create_farm: the same farm for the same tap ───────────────────────────────────

drop function if exists public.create_farm(text, text, int, jsonb, bigint);
create or replace function public.create_farm(
  p_name text,
  p_county text,
  p_birth_year int,
  p_parcels jsonb,
  p_start_balance_bani bigint default 0,
  p_client_id uuid default null
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

  -- Sent before (an answer lost on the way back): the farm it made then.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('create_farm:' || p_client_id::text, 0));
    select id into v_farmer_id from farmers where user_id = auth.uid() and client_id = p_client_id;
    if found then
      return v_farmer_id;
    end if;
  end if;

  insert into farmers (user_id, name, birth_year, county, start_balance_bani, client_id)
  values (auth.uid(), p_name, p_birth_year, p_county, p_start_balance_bani, p_client_id)
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
revoke all on function public.create_farm(text, text, int, jsonb, bigint, uuid) from public, anon;
grant execute on function public.create_farm(text, text, int, jsonb, bigint, uuid) to authenticated;

-- ── The picker's list ─────────────────────────────────────────────────────────────
-- Definer, because an accountant can't read farmers or parcels (RLS): this gives them the name, county and
-- hectares of the farms they're on, and nothing else. Only the caller's own rows.

create or replace function public.my_farms()
returns table (farmer_id uuid, name text, county text, role text, area_ari bigint)
  language sql stable security definer set search_path = public
as $$
  select f.id, f.name, f.county, m.role,
         coalesce((select sum(p.area_ari) from parcels p where p.farmer_id = f.id), 0)::bigint
    from farm_members m
    join farmers f on f.id = m.farmer_id
   where m.user_id = auth.uid()
   order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, f.name, f.id
$$;
revoke all on function public.my_farms() from public, anon;
grant execute on function public.my_farms() to authenticated;
