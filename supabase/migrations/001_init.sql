-- CropCash initial schema. Money is stored as integer bani (bigint), areas as integer ari.
-- See docs/07-architecture.md §3.

create type payment_kind as enum (
  'apia_advance', 'apia_balance', 'crop_sale', 'fuel_refund', 'credit', 'other_in',
  'input_cost', 'rent', 'loan_repayment', 'tax', 'other_out'
);
create type envelope_kind as enum ('spring_inputs', 'debts', 'salary', 'risk_fund', 'pension');

create table farmers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  birth_year int not null check (birth_year between 1920 and 2010),
  county text not null,
  dairy_cows int not null default 0 check (dairy_cows >= 0),
  beef_cattle int not null default 0 check (beef_cattle >= 0),
  start_balance_bani bigint not null default 0,
  stripe_account_id text,
  stripe_customer_id text,
  test_clock_id text,
  created_at timestamptz not null default now()
);

create table parcels (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  crop_id text not null,
  area_ari int not null check (area_ari > 0),
  is_arable boolean not null default true,
  unproductive_ari int not null default 0 check (unproductive_ari >= 0)
);

create table expected_payments (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  kind payment_kind not null,
  direction text not null check (direction in ('in', 'out')),
  amount_min_bani bigint not null,
  amount_probable_bani bigint not null,
  amount_max_bani bigint not null,
  window_start date not null,
  window_end date not null,
  scheme_code text,
  status text not null default 'planned' check (status in ('planned', 'received', 'cancelled')),
  check (amount_min_bani <= amount_probable_bani and amount_probable_bani <= amount_max_bani),
  check (window_start <= window_end)
);

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  kind envelope_kind not null,
  balance_bani bigint not null default 0,
  target_bani bigint,
  unique (farmer_id, kind)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  envelope_id uuid references envelopes(id),
  amount_bani bigint not null,
  occurred_at timestamptz not null,
  source text not null check (source in ('stripe_transfer', 'payout', 'manual', 'allocation', 'subscription')),
  stripe_object_id text unique,
  expected_payment_id uuid references expected_payments(id)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  amount_bani bigint not null check (amount_bani > 0),
  scheduled_for date not null,
  stripe_payout_id text unique,
  status text not null default 'scheduled' check (status in ('scheduled', 'pending', 'paid', 'failed')),
  unique (farmer_id, scheduled_for)
);

create table pension_plans (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null unique references farmers(id) on delete cascade,
  monthly_bani bigint not null check (monthly_bani > 0),
  vehicle text not null check (vehicle in ('pilon3', 'cei_s', 'cei_d')),
  stripe_subscription_id text,
  started_at date not null,
  status text not null default 'active'
);

create table fuel_logs (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  date date not null,
  liters numeric(10, 2) not null check (liters > 0),
  invoice_no text not null,
  supplier text,
  parcel_id uuid references parcels(id) on delete set null
);

create table funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('afir', 'apia', 'madr')),
  url text not null unique,
  title text not null,
  deadline date,
  eligibility_json jsonb not null,
  extracted_at timestamptz not null default now()
);

create index on parcels (farmer_id);
create index on expected_payments (farmer_id, window_start);
create index on transactions (farmer_id, occurred_at);
create index on payouts (farmer_id, scheduled_for);
create index on fuel_logs (farmer_id, date);

-- ── Row Level Security: each user sees only their own farm ──────────────────

-- Returns the farmer ids owned by the current user. SECURITY DEFINER avoids
-- recursive RLS evaluation when child-table policies look up farmers.
create function public.my_farmer_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$ select id from farmers where user_id = auth.uid() $$;
revoke all on function public.my_farmer_ids() from public;
grant execute on function public.my_farmer_ids() to authenticated;

alter table farmers enable row level security;
create policy farmers_own on farmers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['parcels', 'expected_payments', 'envelopes', 'transactions',
                           'payouts', 'pension_plans', 'fuel_logs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (farmer_id in (select public.my_farmer_ids()))
         with check (farmer_id in (select public.my_farmer_ids()))',
      t || '_own', t);
  end loop;
end $$;

-- Funding opportunities are public reference data: readable by any signed-in user,
-- written only by the server (service role bypasses RLS).
alter table funding_opportunities enable row level security;
create policy funding_read on funding_opportunities for select to authenticated using (true);
