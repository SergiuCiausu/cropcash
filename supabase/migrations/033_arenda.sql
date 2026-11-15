-- 033: landowners and arendă contracts (docs/employees-arenda-plan.md §3.1–3.2, docs/15-arenda.md). Safe to run again.
--
-- landowners               the people on the other side of a contract: the landowner the farm pays (taken) or the one
--                          it lets its land to (given, D5). No CNP and no IBAN, ever (D4). Archived, never deleted.
-- lease_contracts          one contract with one landowner: direction, hectares (and the parcels, when on the map),
--                          dates, rent in lei and/or kg of a crop per ha, the primărie registration.
--                          (landowner_id, farmer_id) points at the same farm's landowner, so no contract crosses farms.
-- farmers.landowner_count  „Câți proprietari ai?” at onboarding: how many the list should reach. Null: not asked.
-- The rules match ContractInputSchema (packages/shared/src/arenda/contracts.ts).

create table if not exists public.landowners (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  locality text check (char_length(btrim(locality)) between 1 and 80),
  phone text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  payment text check (payment in ('cash', 'in_kind', 'mixed')),
  note text check (char_length(btrim(note)) between 1 and 200),
  archived_at timestamptz,
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint landowners_id_farm unique (id, farmer_id)
);
create index if not exists landowners_farmer on public.landowners (farmer_id);
create unique index if not exists landowners_client on public.landowners (farmer_id, client_id) where client_id is not null;

create table if not exists public.lease_contracts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  landowner_id uuid not null,
  direction text not null check (direction in ('taken', 'given')),
  area_ari int not null check (area_ari > 0 and area_ari <= 100000),
  locality text check (char_length(btrim(locality)) between 1 and 80),
  plot_ids uuid[] not null default '{}' check (cardinality(plot_ids) <= 500),
  starts_on date not null,
  ends_on date,
  rent_bani_per_ha bigint check (rent_bani_per_ha > 0 and rent_bani_per_ha <= 2000000),
  rent_kg_per_ha int check (rent_kg_per_ha > 0 and rent_kg_per_ha <= 10000),
  rent_crop_id text check (char_length(rent_crop_id) between 1 and 40),
  pay_month int check (pay_month between 1 and 12),
  land_tax_by text check (land_tax_by in ('farm', 'owner')),
  registration_no text check (char_length(btrim(registration_no)) between 1 and 40),
  registration_date date,
  archived_at timestamptz,
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint lease_contracts_landowner foreign key (landowner_id, farmer_id)
    references public.landowners (id, farmer_id) on delete cascade,
  constraint lease_contracts_dates check (ends_on is null or ends_on >= starts_on),
  constraint lease_contracts_rent check (rent_bani_per_ha is not null or rent_kg_per_ha is not null),
  constraint lease_contracts_kind check ((rent_kg_per_ha is null) = (rent_crop_id is null))
);
create index if not exists lease_contracts_farmer on public.lease_contracts (farmer_id);
create index if not exists lease_contracts_landowner on public.lease_contracts (landowner_id);
create unique index if not exists lease_contracts_client on public.lease_contracts (farmer_id, client_id) where client_id is not null;

do $$
declare t text;
begin
  foreach t in array array['landowners', 'lease_contracts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (farmer_id in (select public.my_farmer_ids()))
         with check (farmer_id in (select public.my_farmer_ids()))', t || '_own', t);
    -- Since 30 October 2026, new public tables get no automatic grants. No delete: rows are archived.
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

alter table public.farmers add column if not exists landowner_count int;
do $$ begin
  alter table public.farmers add constraint farmers_landowner_count_check check (landowner_count is null or landowner_count between 1 and 2000);
exception when duplicate_object then null; end $$;
-- Since 012 the farmer may update only the columns granted one by one.
grant update (landowner_count) on table public.farmers to authenticated;
