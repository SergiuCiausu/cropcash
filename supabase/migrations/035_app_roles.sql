-- 035_app_roles.sql — who is an admin, kept in Supabase (docs/admin-opportunities-plan.md, step 1).
-- Replaces the ADMIN_EMAILS / CATALOGUE_EDITORS env lists once the API reads it (step 3). Safe to run again.
--
-- app_roles   one row per (user, role). Keyed by user id, not email: the person signs up first, then gets
--             the role. Deleting the user drops the row, so seed:demo grants the demo user again (step 4).
-- has_role()  the one check, used by RLS policies (step 2) and by the API (step 3). An admin also has
--             every lesser role, so has_role('catalogue_editor') is true for an admin.
--
-- Nobody grants a role through the API: a user reads only their own rows, and there is no write policy.
-- Rows are added from the Supabase dashboard, SQL, or the service role (npm run admin:grant, seed:demo).

create table if not exists public.app_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'catalogue_editor')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  primary key (user_id, role)
);

alter table public.app_roles enable row level security;
drop policy if exists app_roles_read_own on public.app_roles;
create policy app_roles_read_own on public.app_roles for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.app_roles from anon, authenticated;
grant select on table public.app_roles to authenticated;
grant select, insert, update, delete on table public.app_roles to service_role;

-- SECURITY DEFINER so a policy on another table can call it without the caller needing to read
-- app_roles themselves, and without recursive RLS (same reason as my_farmer_ids in 001).
create or replace function public.has_role(p_role text) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_roles
    where user_id = auth.uid()
      and (role = p_role or role = 'admin')
  )
$$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin')
$$;

-- Supabase grants execute on new functions to anon by name, so revoking from public alone leaves it open.
revoke all on function public.has_role(text) from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.has_role(text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
