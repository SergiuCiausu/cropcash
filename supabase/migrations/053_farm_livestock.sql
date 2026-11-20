-- 053: the farm's animals for the APIA papers, phase 3 (docs/rapoarte-apia-plan.md). Safe to run again.
--
-- farmers.livestock  heads per category of the cerere's field 47 (ids in docs/data/livestock.json), the ANSVSA
--                    exploitation code, the dairy cows (PD-07) and the hay gathered off permanent grassland (Anexa 26).
--                    A JSON object checked by the API (packages/shared/src/reports/livestock.ts, LivestockSchema).
--                    Null: nothing noted. Ear tags are not kept: the papers leave their rows blank, to fill by hand.
--
-- dairy_cows and beef_cattle (001) stay as they are: the subsidy engine reads them, and this doesn't change them.

alter table public.farmers add column if not exists livestock jsonb;

do $$ begin
  alter table public.farmers add constraint farmers_livestock_check
    check (livestock is null or (jsonb_typeof(livestock) = 'object' and octet_length(livestock::text) <= 4096));
exception when duplicate_object then null; end $$;

grant update (livestock) on table public.farmers to authenticated;
