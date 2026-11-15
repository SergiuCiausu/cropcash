-- 026: the farm's people and what they cost (docs/employees-arenda-plan.md §1). Safe to run again.
--
-- employees                 one row per person. cost_bani is the TOTAL the person costs the farm (pay, taxes and
--                           contributions, decision D2), per month or per day. People are archived, never deleted,
--                           so old salary expenses keep their name.
-- transactions.employee_id  on a 'salaries' expense: whose pay it was. Step 3 uses it so a recorded pay replaces
--                           that person's planned pay in its month.
-- record_expense            as in 024, plus p_employee_id.
--
-- The 'payroll' envelope is not here: a new enum value can't be used in the transaction that adds it, and the
-- migration runner wraps each file in one. It comes with step 3, where the split fills it.

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  role text check (char_length(btrim(role)) between 1 and 60),
  kind text not null check (kind in ('permanent', 'seasonal', 'zilier')),
  cost_bani bigint not null check (cost_bani > 0 and cost_bani <= 100000000),
  pay_basis text not null check (pay_basis in ('month', 'day')),
  days_per_month int check (days_per_month between 1 and 31),
  active_months int[] check (
    active_months is null
    or (cardinality(active_months) between 1 and 12 and active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12])
  ),
  pay_day int not null default 10 check (pay_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  archived_at timestamptz,
  -- The phone's id for "Adaugă": the same one sent again returns the saved row.
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint employees_dates check (ends_on is null or ends_on >= starts_on),
  constraint employees_days check ((pay_basis = 'day') = (days_per_month is not null)),
  constraint employees_zilier check (kind <> 'zilier' or pay_basis = 'day'),
  constraint employees_permanent check (kind <> 'permanent' or (pay_basis = 'month' and active_months is null))
);
create index if not exists employees_farmer on public.employees (farmer_id);
create unique index if not exists employees_client on public.employees (farmer_id, client_id) where client_id is not null;

alter table public.employees enable row level security;
drop policy if exists employees_own on public.employees;
create policy employees_own on public.employees for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));
-- Since 30 October 2026, new public tables get no automatic grants. No delete: people are archived.
grant select, insert, update on table public.employees to authenticated;
grant select, insert, update, delete on table public.employees to service_role;

-- ── Whose pay an expense was ───────────────────────────────────────────────────

alter table public.transactions add column if not exists employee_id uuid
  references public.employees (id) on delete set null;
alter table public.transactions drop constraint if exists transactions_employee_check;
alter table public.transactions add constraint transactions_employee_check
  check (employee_id is null or (kind = 'expense' and category = 'salaries'));
create index if not exists transactions_employee on public.transactions (employee_id) where employee_id is not null;

-- ── record_expense: as in 024, plus the person ─────────────────────────────────

drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text);
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null,
  p_plot_id uuid default null,
  p_fertilizer_product_id text default null,
  p_fertilizer_qty int default null,
  p_fertilizer_unit text default null,
  p_employee_id uuid default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
  v_crop text := p_crop_id;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_fertilizer_product_id is not null and p_category <> 'fertilizer' then
    raise exception 'a fertilizer goes on a fertilizer expense' using errcode = '22023';
  end if;
  if p_employee_id is not null and p_category <> 'salaries' then
    raise exception 'a person goes on a salaries expense' using errcode = '22023';
  end if;

  -- Sent before: return the saved row and take nothing from the envelope again.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    select id into v_id from transactions where farmer_id = v_farmer and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;

  if p_employee_id is not null then
    perform 1 from employees where id = p_employee_id and farmer_id = v_farmer;
    if not found then
      raise exception 'unknown employee' using errcode = 'P0002';
    end if;
  end if;

  if p_plot_id is not null then
    perform 1 from plots where id = p_plot_id and farmer_id = v_farmer;
    if not found then
      raise exception 'unknown parcel' using errcode = 'P0002';
    end if;
    if v_crop is null then
      select crop_id into v_crop from plot_seasons
       where plot_id = p_plot_id
         and harvest_year = coalesce(p_harvest_year,
               extract(year from p_date)::int + case when extract(month from p_date) >= 11 then 1 else 0 end);
    end if;
  end if;

  if p_envelope is not null then
    select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
      from envelopes where farmer_id = v_farmer and kind = p_envelope for update;
    update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  end if;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note,
                            envelope_taken_bani, harvest_year, client_id, plot_id,
                            fertilizer_product_id, fertilizer_qty, fertilizer_unit, employee_id)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, v_crop, p_note, coalesce(v_taken, 0), p_harvest_year, p_client_id, p_plot_id,
          p_fertilizer_product_id, p_fertilizer_qty, p_fertilizer_unit, p_employee_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text, uuid) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text, uuid) to authenticated;
