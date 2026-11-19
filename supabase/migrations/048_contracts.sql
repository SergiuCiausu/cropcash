-- 048: the farm's contracts other than arendă (docs/contracts-plan.md §2, step 4). Safe to run again.
--
-- parties                  the other side of a contract: a company (with its public CUI) or a person (a name). No CNP,
--                          no IBAN, ever (as D4). Archived, never deleted.
-- contracts                one contract with one party: kind, dates, how it renews, the parcels or hectares, the crop
--                          and tonnes, VAT, a leasing's residual value, and the farmer's decision about its end.
--                          (party_id, farmer_id) points at the same farm's party, so no contract crosses farms.
-- contract_payments        the money schedule, in or out: a first day, a repeat and how many times, lei and/or kg.
--                          Replaced as a whole when the contract is saved (replace_contract_payments).
-- lease_contracts          gets the same decision + decided_on (C2: arendă keeps its own table).
-- transactions.contract_id a recorded payment that belongs to a contract (step 5 lets it replace the planned one).
--
-- Who: owner and manager read and write (my_farmer_ids(), as 033); the accountant only reads; workers see nothing.
-- The rules match FarmContractInputSchema / PartyInputSchema (packages/shared/src/contracts/model.ts).

-- ── The other side ────────────────────────────────────────────────────────────────

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('company', 'person')),
  cui text check (cui ~ '^(RO)?[0-9]{2,10}$'),
  locality text check (char_length(btrim(locality)) between 1 and 80),
  phone text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  note text check (char_length(btrim(note)) between 1 and 200),
  archived_at timestamptz,
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint parties_id_farm unique (id, farmer_id),
  constraint parties_person_no_cui check (kind = 'company' or cui is null)
);
create index if not exists parties_farmer on public.parties (farmer_id);
create unique index if not exists parties_client on public.parties (farmer_id, client_id) where client_id is not null;

-- ── The contract ──────────────────────────────────────────────────────────────────

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  party_id uuid not null,
  kind text not null check (kind in ('comodat', 'sale', 'supply', 'service', 'leasing', 'insurance', 'credit', 'employment', 'other')),
  title text check (char_length(btrim(title)) between 1 and 80),
  number text check (char_length(btrim(number)) between 1 and 40),
  signed_on date,
  starts_on date not null,
  ends_on date,
  auto_renews boolean not null default false,
  notice_days int check (notice_days between 0 and 730),
  renew_months int check (renew_months between 1 and 120),
  plot_ids uuid[] not null default '{}' check (cardinality(plot_ids) <= 500),
  area_ari int check (area_ari > 0 and area_ari <= 100000),
  crop_id text check (char_length(crop_id) between 1 and 40),
  quantity_kg bigint check (quantity_kg > 0 and quantity_kg <= 100000000),
  employee_id uuid,
  credit_group_id uuid,
  vat_bp int check (vat_bp between 0 and 10000),
  residual_bani bigint check (residual_bani > 0 and residual_bani <= 10000000000),
  decision text check (decision in ('renew', 'end', 'renegotiate', 'buy_out', 'return')),
  decided_on date,
  source_document_id uuid,
  archived_at timestamptz,
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint contracts_id_farm unique (id, farmer_id),
  constraint contracts_party foreign key (party_id, farmer_id) references public.parties (id, farmer_id) on delete cascade,
  constraint contracts_employee foreign key (employee_id, farmer_id) references public.employees (id, farmer_id),
  constraint contracts_document foreign key (source_document_id, farmer_id) references public.farm_documents (id, farmer_id),
  constraint contracts_dates check (ends_on is null or ends_on >= starts_on),
  constraint contracts_signed check (signed_on is null or ends_on is null or signed_on <= ends_on),
  constraint contracts_renewal check (ends_on is not null or (not auto_renews and renew_months is null)),
  constraint contracts_kg_crop check (quantity_kg is null or crop_id is not null),
  constraint contracts_sale_crop check (kind <> 'sale' or crop_id is not null),
  constraint contracts_residual check (residual_bani is null or kind = 'leasing'),
  constraint contracts_employee_kind check (employee_id is null or kind = 'employment'),
  constraint contracts_credit_kind check (credit_group_id is null or kind = 'credit'),
  constraint contracts_decided check ((decision is null) = (decided_on is null))
);
create index if not exists contracts_farmer on public.contracts (farmer_id);
create index if not exists contracts_party on public.contracts (party_id);
create unique index if not exists contracts_client on public.contracts (farmer_id, client_id) where client_id is not null;

-- ── The money schedule ────────────────────────────────────────────────────────────

create table if not exists public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  contract_id uuid not null,
  position int not null default 0 check (position between 0 and 119),
  direction text not null check (direction in ('in', 'out')),
  label text check (char_length(btrim(label)) between 1 and 40),
  first_on date not null,
  repeat text not null default 'none' check (repeat in ('none', 'monthly', 'quarterly', 'yearly')),
  times int check (times between 1 and 600),
  amount_bani bigint check (amount_bani > 0 and amount_bani <= 10000000000),
  per_ha boolean not null default false,
  kg bigint check (kg > 0 and kg <= 100000000),
  crop_id text check (char_length(crop_id) between 1 and 40),
  constraint contract_payments_contract foreign key (contract_id, farmer_id) references public.contracts (id, farmer_id) on delete cascade,
  constraint contract_payments_amount check (amount_bani is not null or kg is not null),
  constraint contract_payments_kind check ((kg is null) = (crop_id is null)),
  constraint contract_payments_times check (times is null or repeat <> 'none'),
  constraint contract_payments_per_ha check (not per_ha or amount_bani is not null)
);
create index if not exists contract_payments_contract on public.contract_payments (contract_id, position);

-- ── RLS and grants ────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['parties', 'contracts', 'contract_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (farmer_id in (select public.my_farmer_ids()))
         with check (farmer_id in (select public.my_farmer_ids()))', t || '_own', t);
    -- New public tables get no automatic grants (since 30 October 2026).
    -- The accountant reads the contracts and their money (the Taxe list), never writes. Workers see nothing.
    execute format('drop policy if exists %I on public.%I', t || '_accountant_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (farmer_id in (select public.my_farm_ids(array[''accountant''])))', t || '_accountant_read', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    -- The project's default privileges still hand new tables every right; take back what users never use.
    execute format('revoke delete, truncate, references, trigger on table public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
-- Parties and contracts are archived, never deleted (040's never_deleted). A schedule is replaced through the
-- function below, which runs as the user, so RLS still decides.
grant delete on table public.contract_payments to authenticated;

-- Replaces a contract's whole schedule in one transaction: a half-saved schedule would plan the wrong money.
create or replace function public.replace_contract_payments(p_contract uuid, p_rows jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farm uuid;
begin
  select farmer_id into v_farm from contracts where id = p_contract;
  if not found then
    raise exception 'contract not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  delete from contract_payments where contract_id = p_contract;
  insert into contract_payments (farmer_id, contract_id, position, direction, label, first_on, repeat, times, amount_bani, per_ha, kg, crop_id)
  select v_farm, p_contract, (r.ord - 1)::int, r.v->>'direction', r.v->>'label', (r.v->>'first_on')::date, coalesce(r.v->>'repeat', 'none'),
         (r.v->>'times')::int, (r.v->>'amount_bani')::bigint, coalesce((r.v->>'per_ha')::boolean, false), (r.v->>'kg')::bigint, r.v->>'crop_id'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as r(v, ord);
end $$;
revoke all on function public.replace_contract_payments(uuid, jsonb) from public, anon;
grant execute on function public.replace_contract_payments(uuid, jsonb) to authenticated;

-- ── Arendă's decision ─────────────────────────────────────────────────────────────

alter table public.lease_contracts add column if not exists decision text;
alter table public.lease_contracts add column if not exists decided_on date;
do $$ begin
  alter table public.lease_contracts add constraint lease_contracts_decision
    check (decision is null or decision in ('renew', 'end', 'renegotiate'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.lease_contracts add constraint lease_contracts_decided check ((decision is null) = (decided_on is null));
exception when duplicate_object then null; end $$;

-- ── A recorded payment's contract ─────────────────────────────────────────────────

alter table public.transactions add column if not exists contract_id uuid;
do $$ begin
  alter table public.transactions add constraint transactions_contract
    foreign key (contract_id, farmer_id) references public.contracts (id, farmer_id);
exception when duplicate_object then null; end $$;
create index if not exists transactions_contract on public.transactions (contract_id) where contract_id is not null;
-- record_expense (024) doesn't take it, so the API sets it on the row it just made, as it does the document (027).
grant update (contract_id) on table public.transactions to authenticated;
