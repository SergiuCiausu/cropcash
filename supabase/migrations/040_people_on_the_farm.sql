-- 040: people on the farm (docs/workspaces-plan.md step 6). Safe to run again.
--
-- Until now an owner could invite only read-only people (accountant, viewer, 028). From here:
--
--   farm_invites       also for a manager or a worker; remembers who made the link (invited_by)
--   who invites        the owner: any role; a manager: worker, accountant, viewer (W4). Same for cancelling a link.
--   who sees people    the owner and the managers see the farm's members and open links
--   who removes        the owner: anyone but themself; a manager: workers, accountants, viewers. Anyone may leave.
--   set_member_role    the owner changes someone's role (never their own: that's a handover)
--   link_member_employee  the owner links a member to a person on the payroll (employees), one member per person
--   transfer_farm      the owner hands the farm to one of its managers and becomes a manager
--   accept_farm_invite someone already on the farm keeps their role (a link never demotes); the owner still gets own_farm
--   pension, payouts   owner only, in the database too (they were "owner or manager" since 035)
--   grants             the automatic grants found on 2026-11-17 (plan §7): anon loses everything but reading the
--                      public reference tables; authenticated loses truncate/references/trigger everywhere, writes on
--                      the tables only the server writes, and delete where nothing the user does ever deletes.

-- ── Invites ───────────────────────────────────────────────────────────────────────

alter table public.farm_invites drop constraint if exists farm_invites_role_check;
alter table public.farm_invites add constraint farm_invites_role_check
  check (role in ('manager', 'worker', 'accountant', 'viewer'));
-- Filled by the database, not by the caller: it isn't in the insert grant (028).
alter table public.farm_invites add column if not exists invited_by uuid
  references auth.users (id) on delete set null default auth.uid();

drop policy if exists farm_invites_owner on public.farm_invites;
drop policy if exists farm_invites_team_read on public.farm_invites;
create policy farm_invites_team_read on public.farm_invites for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager'])));
drop policy if exists farm_invites_owner_insert on public.farm_invites;
create policy farm_invites_owner_insert on public.farm_invites for insert to authenticated
  with check (farmer_id in (select public.my_farm_ids(array['owner'])) and accepted_by is null);
drop policy if exists farm_invites_manager_insert on public.farm_invites;
create policy farm_invites_manager_insert on public.farm_invites for insert to authenticated
  with check (farmer_id in (select public.my_farm_ids(array['manager']))
              and role in ('worker', 'accountant', 'viewer') and accepted_by is null);
drop policy if exists farm_invites_owner_cancel on public.farm_invites;
create policy farm_invites_owner_cancel on public.farm_invites for update to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner'])));
drop policy if exists farm_invites_manager_cancel on public.farm_invites;
create policy farm_invites_manager_cancel on public.farm_invites for update to authenticated
  using (farmer_id in (select public.my_farm_ids(array['manager'])) and role in ('worker', 'accountant', 'viewer'))
  with check (farmer_id in (select public.my_farm_ids(array['manager'])) and role in ('worker', 'accountant', 'viewer'));

-- ── Members ───────────────────────────────────────────────────────────────────────

-- farm_members_self (028) stays: everyone sees their own rows and may leave (farm_keep_owner stops the owner).
drop policy if exists farm_members_owner on public.farm_members;
drop policy if exists farm_members_team_read on public.farm_members;
create policy farm_members_team_read on public.farm_members for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager'])));
drop policy if exists farm_members_owner_remove on public.farm_members;
create policy farm_members_owner_remove on public.farm_members for delete to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])));
drop policy if exists farm_members_manager_remove on public.farm_members;
create policy farm_members_manager_remove on public.farm_members for delete to authenticated
  using (farmer_id in (select public.my_farm_ids(array['manager'])) and role in ('worker', 'accountant', 'viewer'));

-- One account per person on the payroll.
create unique index if not exists farm_members_employee on public.farm_members (employee_id) where employee_id is not null;

-- Errors carry a hint the API turns into words: not_found, is_owner, bad_role, employee_not_found, employee_taken,
-- not_manager; require_farm_role adds not_a_member and role_not_allowed.
create or replace function public.set_member_role(p_member uuid, p_role text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  m farm_members%rowtype;
begin
  select * into m from farm_members where id = p_member for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.require_farm_role(m.farmer_id, array['owner']);
  if m.role = 'owner' then
    raise exception 'the owner changes hands only by transfer_farm' using errcode = '22023', hint = 'is_owner';
  end if;
  if p_role is null or p_role not in ('manager', 'worker', 'accountant', 'viewer') then
    raise exception 'role % is not one to give', p_role using errcode = '22023', hint = 'bad_role';
  end if;
  update farm_members set role = p_role where id = p_member;
end $$;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;

-- p_employee null: the member is no longer linked to anyone on the payroll.
create or replace function public.link_member_employee(p_member uuid, p_employee uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  m farm_members%rowtype;
begin
  select * into m from farm_members where id = p_member for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.require_farm_role(m.farmer_id, array['owner']);
  if p_employee is not null and not exists (select 1 from employees e where e.id = p_employee and e.farmer_id = m.farmer_id) then
    raise exception 'no such person on this farm' using errcode = 'P0002', hint = 'employee_not_found';
  end if;
  begin
    update farm_members set employee_id = p_employee where id = p_member;
  exception when unique_violation then
    raise exception 'that person is already linked to an account' using errcode = '22023', hint = 'employee_taken';
  end;
end $$;
revoke all on function public.link_member_employee(uuid, uuid) from public, anon;
grant execute on function public.link_member_employee(uuid, uuid) to authenticated;

-- The owner hands the farm to one of its managers, in one transaction: old owner → manager, then the manager →
-- owner (farm_one_owner allows only one at a time, so the order matters). farmers.user_id follows the owner, so
-- farmers_own (001) and the step-2 shims keep meaning "the owner". The Stripe account stays with the farm (W7).
create or replace function public.transfer_farm(p_farm uuid, p_member uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  m farm_members%rowtype;
begin
  perform public.require_farm_role(p_farm, array['owner']);
  select * into m from farm_members where id = p_member and farmer_id = p_farm for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if m.role <> 'manager' then
    raise exception 'the farm goes only to one of its managers' using errcode = '22023', hint = 'not_manager';
  end if;
  update farm_members set role = 'manager' where farmer_id = p_farm and user_id = auth.uid();
  update farm_members set role = 'owner' where id = p_member;
  update farmers set user_id = m.user_id where id = p_farm;
end $$;
revoke all on function public.transfer_farm(uuid, uuid) from public, anon;
grant execute on function public.transfer_farm(uuid, uuid) to authenticated;

-- Accepting a link. Same answers as 028, except: whether "it's my own farm" comes from membership (the farm may
-- have changed hands), and someone already on the farm keeps their role (a manager opening a worker link stays a
-- manager; the owner changes roles with set_member_role).
create or replace function public.accept_farm_invite(p_token_hash text)
  returns table (farmer_id uuid, farm_name text, role text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  inv farm_invites%rowtype;
  v_role text;
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
  select m.role into v_role from farm_members m where m.farmer_id = inv.farmer_id and m.user_id = me;
  if v_role = 'owner' then
    raise exception 'own farm' using errcode = '22023', hint = 'own_farm';
  end if;
  if v_role is null then
    insert into farm_members (farmer_id, user_id, role, invited_by) values (inv.farmer_id, me, inv.role, inv.invited_by);
    v_role := inv.role;
  end if;
  update farm_invites set accepted_by = me, accepted_at = coalesce(accepted_at, now()) where id = inv.id;
  return query select f.id, f.name, v_role from farmers f where f.id = inv.farmer_id;
end $$;
revoke all on function public.accept_farm_invite(text) from public, anon;
grant execute on function public.accept_farm_invite(text) to authenticated;

-- ── The owner's own money ─────────────────────────────────────────────────────────

-- The API already keeps them from a manager (farmViewFor); now the database does too.
drop policy if exists pension_plans_own on public.pension_plans;
create policy pension_plans_own on public.pension_plans for all to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner'])));
drop policy if exists payouts_own on public.payouts;
create policy payouts_own on public.payouts for all to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner'])));

-- ── Grants (plan §7) ──────────────────────────────────────────────────────────────
-- Nobody calls Supabase without a session (the API sends the user's token; jobs use the service key), and the
-- service key is not touched here. RLS stays the gate for rows; these only take away what is never used.

do $$
declare
  t text;
  -- Public reference data: anyone may read, only the server writes. Views are security_invoker (034, 037)
  -- but lose the write grants too.
  reference text[] := array['documents', 'fertilizer_products', 'fertilizer_types', 'opportunities',
    'opportunity_events', 'source_changes', 'lpis_blocs', 'siruta_units', 'siruta_places'];
  -- Written only by the server or the monitor (service key); admins read some through their policies (037).
  server_only text[] := array['_migrations', 'change_events', 'links_seen', 'prediction_overrides',
    'prediction_versions', 'robots_cache', 'runs', 'snapshots', 'sources', 'admin_opportunities', 'admin_source_health'];
  -- The farm's tables, where a user's request (the API as the user, or a SECURITY INVOKER function) deletes rows.
  deleted_by_users text[] := array['expected_payments', 'farm_event_occurrences', 'farm_events', 'farm_leases',
    'farm_members', 'opportunity_follows', 'parcels', 'plot_operations', 'plot_seasons', 'plots',
    'task_completions', 'transactions'];
  -- The farm's tables nothing the user does deletes from (people and contracts are archived, money is undone
  -- through transactions, a farm isn't deleted yet).
  never_deleted text[] := array['envelopes', 'farmers', 'fuel_logs', 'landowners', 'lease_contracts'];
begin
  foreach t in array reference || server_only || deleted_by_users || never_deleted loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', t);
  end loop;
  foreach t in array reference loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', t);
  end loop;
  foreach t in array server_only loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke insert, update, delete on table public.%I from authenticated', t);
  end loop;
  foreach t in array deleted_by_users || never_deleted loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke all on table public.%I from anon', t);
  end loop;
  foreach t in array never_deleted loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke delete on table public.%I from authenticated', t);
  end loop;
end $$;
-- Already tight, made by hand: employees (038), farm_invites, profiles, app_roles, pension_plans, payouts (select
-- only), farmer_sources and watched_pages (none).
revoke truncate, references, trigger on table public.pension_plans, public.payouts from authenticated;
