-- 052: which excise schemes the farm joined (docs/accize-plan.md §2.2, step 2). Safe to run again.
--
-- farm_excise_schemes  one row per farm, scheme and year. scheme_id is an id from docs/data/excise-schemes.json
--                      (the catalogue stays in the JSON; the API checks the id and the status against it,
--                      packages/shared/src/data/excise.ts → exciseEnrollmentRefusal).
--   status    interested | acord_filed | approved | left. Only `approved` on a refund puts money in the plan.
--   acord_on  the day the acord was filed (a mid-year acord covers only the months left). Only with an acord.
--
-- Who: owner and manager read and write (my_farmer_ids(), as 048); the accountant only reads; workers see nothing.
-- Never deleted: leaving is status `left`, so the history of a year stays (as 040's never_deleted).

create table if not exists public.farm_excise_schemes (
  farmer_id  uuid not null references public.farmers(id) on delete cascade,
  scheme_id  text not null check (scheme_id ~ '^[a-z0-9-]{1,64}$'),
  year       int  not null check (year between 2015 and 2100),
  status     text not null default 'interested' check (status in ('interested', 'acord_filed', 'approved', 'left')),
  acord_on   date,
  updated_at timestamptz not null default now(),
  primary key (farmer_id, scheme_id, year),
  constraint farm_excise_schemes_acord_check check (acord_on is null or status in ('acord_filed', 'approved'))
);

-- updated_at follows every change, whatever the client sends.
create or replace function public.farm_excise_schemes_touch() returns trigger
  language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists farm_excise_schemes_touch on public.farm_excise_schemes;
create trigger farm_excise_schemes_touch before insert or update on public.farm_excise_schemes
  for each row execute function public.farm_excise_schemes_touch();

-- ── RLS and grants ────────────────────────────────────────────────────────────────

alter table public.farm_excise_schemes enable row level security;

drop policy if exists farm_excise_schemes_own on public.farm_excise_schemes;
create policy farm_excise_schemes_own on public.farm_excise_schemes for all to authenticated
  using (farmer_id in (select public.my_farmer_ids()))
  with check (farmer_id in (select public.my_farmer_ids()));

drop policy if exists farm_excise_schemes_accountant_read on public.farm_excise_schemes;
create policy farm_excise_schemes_accountant_read on public.farm_excise_schemes for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['accountant'])));

-- New public tables get no automatic grants (since 30 October 2026); the project's default privileges may still
-- hand out every right, so take back what users never use.
revoke all on table public.farm_excise_schemes from anon;
grant select, insert, update on table public.farm_excise_schemes to authenticated;
revoke delete, truncate, references, trigger on table public.farm_excise_schemes from authenticated;
grant select, insert, update, delete on table public.farm_excise_schemes to service_role;

revoke all on function public.farm_excise_schemes_touch() from public, anon, authenticated;
