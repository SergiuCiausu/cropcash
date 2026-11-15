-- 028: people the farmer lets see the farm's reports (docs/rapoarte-pdf-plan.md §6, faza 3): the
-- accountant, or someone of the farm (a partner, family, the bank). Read-only, never money.
--
-- Members get NO policy on the farm's own tables: with the public key they could otherwise read every
-- column of them (Stripe ids, pension). The API checks the membership here, then reads the farm with
-- the service key and sends only what the reports need. my_farmer_ids() stays the owner's farm only,
-- so every write route keeps refusing members. Safe to run again.

create table if not exists public.farm_members (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('accountant', 'viewer')),
  created_at timestamptz not null default now(),
  unique (farmer_id, user_id)
);
create index if not exists farm_members_user on public.farm_members (user_id);

-- One-time links. Only the SHA-256 of the code is kept: the code itself lives in the link alone.
create table if not exists public.farm_invites (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  role text not null check (role in ('accountant', 'viewer')),
  email text check (email is null or char_length(email) between 3 and 254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists farm_invites_farmer on public.farm_invites (farmer_id);

alter table public.farm_members enable row level security;
alter table public.farm_invites enable row level security;
revoke all on table public.farm_members, public.farm_invites from anon;

-- Members: the owner sees and removes them; a member sees and leaves their own. Nobody inserts
-- directly: accept_farm_invite does.
revoke all on table public.farm_members from authenticated;
grant select, delete on table public.farm_members to authenticated;
drop policy if exists farm_members_owner on farm_members;
create policy farm_members_owner on farm_members for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()));
drop policy if exists farm_members_self on farm_members;
create policy farm_members_self on farm_members for all to authenticated
  using (user_id = auth.uid());

-- Invites: the owner makes them, sees them and cancels them (revoked_at only).
revoke all on table public.farm_invites from authenticated;
grant select on table public.farm_invites to authenticated;
grant insert (farmer_id, role, email, token_hash, expires_at) on table public.farm_invites to authenticated;
grant update (revoked_at) on table public.farm_invites to authenticated;
drop policy if exists farm_invites_owner on farm_invites;
create policy farm_invites_owner on farm_invites for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()) and accepted_by is null);

-- Accepting a link: the only way in. Errors carry a hint the API turns into words:
-- not_found, used, expired, own_farm. Accepting the same link again, as the same person, is fine.
create or replace function public.accept_farm_invite(p_token_hash text)
  returns table (farmer_id uuid, farm_name text, role text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  inv farm_invites%rowtype;
  owner uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into inv from farm_invites i where i.token_hash = p_token_hash for update;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if inv.revoked_at is not null or (inv.accepted_by is not null and inv.accepted_by <> me) then
    raise exception 'invite already used' using errcode = '22023', hint = 'used';
  end if;
  if inv.accepted_by is null and inv.expires_at < now() then
    raise exception 'invite expired' using errcode = '22023', hint = 'expired';
  end if;
  select f.user_id into owner from farmers f where f.id = inv.farmer_id;
  if owner = me then
    raise exception 'own farm' using errcode = '22023', hint = 'own_farm';
  end if;
  insert into farm_members (farmer_id, user_id, role) values (inv.farmer_id, me, inv.role)
    on conflict on constraint farm_members_farmer_id_user_id_key do update set role = excluded.role;
  update farm_invites set accepted_by = me, accepted_at = coalesce(accepted_at, now()) where id = inv.id;
  return query select f.id, f.name, inv.role from farmers f where f.id = inv.farmer_id;
end $$;
revoke all on function public.accept_farm_invite(text) from public, anon;
grant execute on function public.accept_farm_invite(text) to authenticated;

-- The farms I'm a member of, with the names a member may see (not the farm's other columns).
create or replace function public.my_memberships()
  returns table (farmer_id uuid, farm_name text, county text, role text, since timestamptz)
  language sql stable security definer set search_path = public
as $$
  select m.farmer_id, f.name, f.county, m.role, m.created_at
  from farm_members m join farmers f on f.id = m.farmer_id
  where m.user_id = auth.uid()
  order by f.name;
$$;
revoke all on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;
