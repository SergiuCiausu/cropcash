-- 035: membership decides who reaches a farm (docs/workspaces-plan.md step 1). Safe to run again.
--
-- Until now the farm's owner was `farmers.user_id` and nothing else; farm_members (028) held only the read-only
-- people (accountant, viewer). From here every farm has exactly one `owner` row in farm_members, and the access
-- rule my_farmer_ids() reads farm_members instead of farmers.user_id. Every `*_own` policy goes through that
-- function, so they all follow without being touched.
--
-- What this step does NOT change yet: farmers.user_id stays unique (one farm per user until step 4), the SQL
-- functions still find "my farm" by farmers.user_id (step 2), invites still offer only accountant / viewer
-- (step 6). With only owners and read-only members in the table, nobody sees anything new.
--
--   farm_members             roles owner | manager | worker | accountant | viewer; one owner per farm;
--                            employee_id (a member who is also a paid person), invited_by
--   farm_owner_on_create     trigger: a new farm gets its owner row, whoever inserts it (API, seed, tests)
--   farm_keep_owner          trigger: the owner row can't be deleted while the farm and the person both exist
--   my_farm_ids(roles)       the farms where I hold one of the roles (all my farms when roles is null)
--   require_farm_role(...)   for SQL functions (step 2): my role on that farm, or 42501
--   my_farmer_ids()          now: farms where I'm owner or manager
--   profiles                 one row per person: name, birth year, the farm opened last

-- ── Roles ─────────────────────────────────────────────────────────────────────────

alter table public.farm_members drop constraint if exists farm_members_role_check;
alter table public.farm_members add constraint farm_members_role_check
  check (role in ('owner', 'manager', 'worker', 'accountant', 'viewer'));

alter table public.farm_members add column if not exists employee_id uuid
  references public.employees (id) on delete set null;
alter table public.farm_members add column if not exists invited_by uuid
  references auth.users (id) on delete set null;

-- ── Every farm's creator becomes its owner ───────────────────────────────────────

insert into public.farm_members (farmer_id, user_id, role, created_at)
select f.id, f.user_id, 'owner', f.created_at from public.farmers f
on conflict on constraint farm_members_farmer_id_user_id_key do update set role = 'owner';

create unique index if not exists farm_one_owner on public.farm_members (farmer_id) where role = 'owner';

-- A new farm gets its owner row in the same statement. SECURITY DEFINER: nobody may insert into farm_members
-- directly (028), and the farm can be created by the user (RLS) or by the service key (seed).
create or replace function public.farm_owner_on_create() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into farm_members (farmer_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict on constraint farm_members_farmer_id_user_id_key do update set role = 'owner';
  return new;
end $$;
revoke all on function public.farm_owner_on_create() from public, anon, authenticated;

drop trigger if exists farm_owner_on_create on public.farmers;
create trigger farm_owner_on_create after insert on public.farmers
  for each row execute function public.farm_owner_on_create();

-- The owner can't leave their own farm or be removed from it. Allowed when the farm itself is being deleted, or
-- the person's account is (both cascade here, and by then their row is already gone). Handing the farm over to
-- someone else comes with step 6.
create or replace function public.farm_keep_owner() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'owner'
     and exists (select 1 from farmers where id = old.farmer_id)
     and exists (select 1 from auth.users where id = old.user_id) then
    raise exception 'the owner stays on the farm' using errcode = '42501', hint = 'owner_stays';
  end if;
  return old;
end $$;
revoke all on function public.farm_keep_owner() from public, anon, authenticated;

drop trigger if exists farm_keep_owner on public.farm_members;
create trigger farm_keep_owner before delete on public.farm_members
  for each row execute function public.farm_keep_owner();

-- ── The access rule ───────────────────────────────────────────────────────────────

-- Farms where I hold one of these roles; all my farms when roles is null. SECURITY DEFINER avoids recursive RLS
-- on farm_members, as my_farmer_ids() always did on farmers.
create or replace function public.my_farm_ids(roles text[] default null) returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select m.farmer_id from farm_members m
  where m.user_id = auth.uid() and (roles is null or m.role = any (roles))
$$;
revoke all on function public.my_farm_ids(text[]) from public, anon;
grant execute on function public.my_farm_ids(text[]) to authenticated;

-- For the SQL functions that act on one farm (step 2): returns my role there, or raises 42501 with a hint the API
-- turns into words: not_signed_in, not_a_member, role_not_allowed.
create or replace function public.require_farm_role(p_farm uuid, roles text[]) returns text
  language plpgsql stable security definer set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select m.role into v_role from farm_members m where m.farmer_id = p_farm and m.user_id = auth.uid();
  if not found then
    raise exception 'not a member of this farm' using errcode = '42501', hint = 'not_a_member';
  end if;
  if not (v_role = any (roles)) then
    raise exception 'role % may not do this', v_role using errcode = '42501', hint = 'role_not_allowed';
  end if;
  return v_role;
end $$;
revoke all on function public.require_farm_role(uuid, text[]) from public, anon;
grant execute on function public.require_farm_role(uuid, text[]) to authenticated;

-- Same name and signature as in 001, so every policy that calls it keeps working. Owner and manager reach the
-- farm's own tables; worker gets its own policies in step 7; accountant and viewer go through the API (028).
create or replace function public.my_farmer_ids() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select m.farmer_id from farm_members m
  where m.user_id = auth.uid() and m.role in ('owner', 'manager')
$$;

-- The farm row itself: farmers_own (001) still lets the creator in, which keeps INSERT … RETURNING working before
-- the owner row exists. This one lets the team in through membership. Column grants (012 onward) still decide
-- what may be updated.
drop policy if exists farmers_team_read on public.farmers;
create policy farmers_team_read on public.farmers for select to authenticated
  using (id in (select public.my_farmer_ids()));
drop policy if exists farmers_team_update on public.farmers;
create policy farmers_team_update on public.farmers for update to authenticated
  using (id in (select public.my_farmer_ids()))
  with check (id in (select public.my_farmer_ids()));

-- ── Members and invites stay the owner's business ─────────────────────────────────

-- 028 used my_farmer_ids() here; it now includes managers, who don't manage people before step 6 (W4).
drop policy if exists farm_members_owner on public.farm_members;
create policy farm_members_owner on public.farm_members for all to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])));

drop policy if exists farm_invites_owner on public.farm_invites;
create policy farm_invites_owner on public.farm_invites for all to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner'])) and accepted_by is null);

-- The farms I read as accountant or viewer (/contabil). The owner row is not a "membership" here.
create or replace function public.my_memberships()
  returns table (farmer_id uuid, farm_name text, county text, role text, since timestamptz)
  language sql stable security definer set search_path = public
as $$
  select m.farmer_id, f.name, f.county, m.role, m.created_at
  from farm_members m join farmers f on f.id = m.farmer_id
  where m.user_id = auth.uid() and m.role in ('accountant', 'viewer')
  order by f.name;
$$;

-- ── Profiles: the person, apart from the farm ─────────────────────────────────────

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  birth_year int check (birth_year between 1920 and 2010),
  -- The farm opened last, for the next sign-in (step 4). Only a farm I belong to (policy below).
  last_farm_id uuid references public.farmers (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
-- Since 30 October 2026, new public tables get no automatic grants. Rows are made by the trigger below.
grant select on table public.profiles to authenticated;
grant update (display_name, birth_year, last_farm_id) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (user_id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (last_farm_id is null or last_farm_id in (select public.my_farm_ids())));

-- A new account gets its profile. Kept tiny: a failure here would stop sign-ups.
create or replace function public.profile_on_signup() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.profile_on_signup() from public, anon, authenticated;

drop trigger if exists profile_on_signup on auth.users;
create trigger profile_on_signup after insert on auth.users
  for each row execute function public.profile_on_signup();

-- Existing accounts: a profile each, with the name and birth year their farm has today (farmers keeps its copy
-- until W2 is decided; nothing reads profiles yet).
insert into public.profiles (user_id, display_name, birth_year, last_farm_id)
select u.id, left(nullif(btrim(f.name), ''), 80), f.birth_year, f.id
from auth.users u left join public.farmers f on f.user_id = u.id
on conflict (user_id) do nothing;
