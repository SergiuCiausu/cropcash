-- 032: how the farm works its land (docs/employees-arenda-plan.md §2). Safe to run again.
--
-- farmers.farm_mode       „Cum lucrezi pământul?”: 'own' (mostly the farm's own land) or 'arendas' (mostly land taken
--                         in arendă). A preset for the interface only; existing farms are 'own'.
-- farmers.leased_in_ari   Of the farm's hectares, how many are taken in arendă (asked at onboarding; null: not asked).
-- farmers.leased_out_ari  Land the farm owns and lets to someone else (D5). Not in the parcels: a cerere doesn't list it.
-- plots.tenure            Per parcel: 'own', 'leased_in' or 'leased_out'. Set with the Arendă screen (plan step 7);
--                         until then every parcel is 'own', and save_plots leaves it as it is.

alter table public.farmers add column if not exists farm_mode text not null default 'own';
alter table public.farmers add column if not exists leased_in_ari int;
alter table public.farmers add column if not exists leased_out_ari int;

do $$ begin
  alter table public.farmers add constraint farmers_farm_mode_check check (farm_mode in ('own', 'arendas'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.farmers add constraint farmers_leased_check
    check ((leased_in_ari is null or leased_in_ari >= 0) and (leased_out_ari is null or leased_out_ari >= 0));
exception when duplicate_object then null; end $$;

-- Since 012 the farmer may update only the columns granted one by one.
grant update (farm_mode, leased_in_ari, leased_out_ari) on table public.farmers to authenticated;

alter table public.plots add column if not exists tenure text not null default 'own';
do $$ begin
  alter table public.plots add constraint plots_tenure_check check (tenure in ('own', 'leased_in', 'leased_out'));
exception when duplicate_object then null; end $$;
