-- 042: the worker's small app and "who noted this" (docs/workspaces-plan.md step 7; docs/employees-arenda-plan.md
-- §4.3, §4.5). Safe to run again.
--
--   created_by          on transactions, fuel_logs, farm_events, plot_operations, task_completions: the account that
--                       noted the row. Set by the database (auth.uid()), whatever the caller sends; the service key
--                       (seed, webhooks) leaves what it was given.
--   plot_operations     assigned_to: the person on the payroll who should do it (null: anyone on the farm)
--   fuel_logs           the diesel a worker puts in, in litres only (W5): no invoice needed, on a parcel or not.
--                       Purchases with lei stay expenses with litres on them (027), as the motorină report reads.
--   worker reads        the farm's parcels and their work (plots, plot_seasons, plot_operations) and their own diesel
--                       notes. Nothing with money: not transactions, envelopes, employees, farm_events (they carry
--                       amounts), lease contracts, pension. The farm's name comes from my_farms() (039).
--   finish_operation    „Am terminat”: owner, manager or worker; a worker only work that's theirs or anyone's
--   log_fuel            „Motorină”: owner, manager or worker; the same tap twice is one row (client_id)
--   farm_member_names   the names behind created_by, for the owner and the managers

-- ── Who noted it ──────────────────────────────────────────────────────────────────

create or replace function public.stamp_created_by() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- Signed in: always the caller, never what the row claims. Service key: what it was given.
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function public.stamp_created_by() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['transactions', 'fuel_logs', 'farm_events', 'plot_operations', 'task_completions'] loop
    execute format('alter table public.%I add column if not exists created_by uuid references auth.users (id) on delete set null', t);
    execute format('drop trigger if exists stamp_created_by on public.%I', t);
    execute format('create trigger stamp_created_by before insert on public.%I for each row execute function public.stamp_created_by()', t);
  end loop;
end $$;

-- ── Work given to someone ─────────────────────────────────────────────────────────

do $$
begin
  -- Added once: the foreign key below depends on it, so it can't be dropped and made again.
  if not exists (select 1 from pg_constraint where conname = 'employees_id_farm') then
    alter table public.employees add constraint employees_id_farm unique (id, farmer_id);
  end if;
end $$;

alter table public.plot_operations add column if not exists assigned_to uuid;
alter table public.plot_operations drop constraint if exists plot_operations_assigned_to_fkey;
-- Only someone of the same farm; a person deleted leaves the work to anyone.
alter table public.plot_operations add constraint plot_operations_assigned_to_fkey
  foreign key (assigned_to, farmer_id) references public.employees (id, farmer_id) on delete set null (assigned_to);
create index if not exists plot_operations_assigned on public.plot_operations (farmer_id, status, assigned_to);

-- ── Diesel noted in litres ────────────────────────────────────────────────────────

alter table public.fuel_logs alter column invoice_no drop not null;
alter table public.fuel_logs add column if not exists plot_id uuid;
alter table public.fuel_logs drop constraint if exists fuel_logs_plot_fkey;
alter table public.fuel_logs add constraint fuel_logs_plot_fkey
  foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete set null (plot_id);
alter table public.fuel_logs add column if not exists note text check (note is null or char_length(note) between 1 and 200);
alter table public.fuel_logs add column if not exists client_id uuid;
create unique index if not exists fuel_logs_client on public.fuel_logs (farmer_id, client_id) where client_id is not null;
alter table public.fuel_logs add column if not exists created_at timestamptz not null default now();
alter table public.fuel_logs drop constraint if exists fuel_logs_liters_cap;
alter table public.fuel_logs add constraint fuel_logs_liters_cap check (liters <= 100000);

-- ── What a worker reads ───────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['plots', 'plot_seasons', 'plot_operations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_worker_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (farmer_id in (select public.my_farm_ids(array[''worker''])))', t || '_worker_read', t);
  end loop;
end $$;

drop policy if exists fuel_logs_worker_read on public.fuel_logs;
create policy fuel_logs_worker_read on public.fuel_logs for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['worker'])) and created_by = auth.uid());

-- ── What a worker does ────────────────────────────────────────────────────────────

-- My person on that farm's payroll, if the owner linked one (040).
create or replace function public.my_employee_id(p_farm uuid) returns uuid
  language sql stable security definer set search_path = public
as $$
  select m.employee_id from farm_members m where m.farmer_id = p_farm and m.user_id = auth.uid()
$$;
revoke all on function public.my_employee_id(uuid) from public, anon;
grant execute on function public.my_employee_id(uuid) to authenticated;

-- „Am terminat”. Hints: not_found (not on this farm, or given to someone else), role_not_allowed. Done already: fine,
-- the same answer (the tap came twice, or someone else finished it).
create or replace function public.finish_operation(p_farm uuid, p_id uuid, p_on date) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
  op plot_operations%rowtype;
begin
  v_role := public.require_farm_role(p_farm, array['owner', 'manager', 'worker']);
  select * into op from plot_operations where id = p_id and farmer_id = p_farm for update;
  if not found or (v_role = 'worker' and op.assigned_to is not null and op.assigned_to is distinct from public.my_employee_id(p_farm)) then
    raise exception 'no such work for you' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_on is null or p_on > current_date + 1 or p_on < current_date - 366 then
    raise exception 'date out of range' using errcode = '22023', hint = 'bad_date';
  end if;
  if op.status = 'planned' then
    update plot_operations set status = 'done', on_date = p_on where id = p_id;
  end if;
  return p_id;
end $$;
revoke all on function public.finish_operation(uuid, uuid, date) from public, anon;
grant execute on function public.finish_operation(uuid, uuid, date) to authenticated;

-- „Motorină”: litres put in, on a parcel or not. Hints: role_not_allowed, bad_date, bad_plot.
create or replace function public.log_fuel(p_farm uuid, p_on date, p_liters numeric, p_plot uuid, p_note text, p_client_id uuid)
  returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.require_farm_role(p_farm, array['owner', 'manager', 'worker']);
  if p_on is null or p_on > current_date + 1 or p_on < current_date - 366 then
    raise exception 'date out of range' using errcode = '22023', hint = 'bad_date';
  end if;
  if p_plot is not null and not exists (select 1 from plots where id = p_plot and farmer_id = p_farm) then
    raise exception 'no such parcel on this farm' using errcode = '22023', hint = 'bad_plot';
  end if;
  if p_client_id is not null then
    -- The same tap again: the row it made. Locked per farm and id, so two sends at once make one row.
    perform pg_advisory_xact_lock(hashtextextended(p_farm::text || p_client_id::text, 42));
    select id into v_id from fuel_logs where farmer_id = p_farm and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;
  insert into fuel_logs (farmer_id, date, liters, plot_id, note, client_id, created_by)
  values (p_farm, p_on, p_liters, p_plot, nullif(btrim(p_note), ''), p_client_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_fuel(uuid, date, numeric, uuid, text, uuid) from public, anon;
grant execute on function public.log_fuel(uuid, date, numeric, uuid, text, uuid) to authenticated;

-- The names behind created_by, for the farm's owner and managers: the name in the profile, else the e-mail before @.
-- Only people on the farm (someone who left shows as unknown).
create or replace function public.farm_member_names(p_farm uuid) returns table (user_id uuid, name text)
  language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_farm_role(p_farm, array['owner', 'manager']);
  return query
    select m.user_id, coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1))::text
    from farm_members m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.user_id = m.user_id
    where m.farmer_id = p_farm;
end $$;
revoke all on function public.farm_member_names(uuid) from public, anon;
grant execute on function public.farm_member_names(uuid) to authenticated;
