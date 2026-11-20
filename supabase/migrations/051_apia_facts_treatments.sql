-- 051: the APIA papers, phase 2 (docs/rapoarte-apia-plan.md).
--
-- farmers.apia_facts         the farmer's answers to „Ai animale?”, „Ai cerut sprijin cuplat?”, „Ai teren ecologic?”,
--                            „Folosești motorină?”, so /rapoarte → „Pentru APIA” stops asking. A JSON object of
--                            booleans, plus `coupled_crops` (the crop ids declared for coupled support). Missing key:
--                            not asked (packages/shared/src/reports/apia.ts, ApiaAnswersSchema).
-- plot_operations.target     what a treatment was against (boala, dăunătorul, buruiana): the register's „Motivul”.
-- plot_operations.operator   who applied it: the register's „Cine a aplicat”.

alter table public.farmers add column if not exists apia_facts jsonb;

do $$ begin
  alter table public.farmers add constraint farmers_apia_facts_check
    check (apia_facts is null or (jsonb_typeof(apia_facts) = 'object' and octet_length(apia_facts::text) <= 4096));
exception when duplicate_object then null; end $$;

grant update (apia_facts) on table public.farmers to authenticated;

alter table public.plot_operations add column if not exists target text;
alter table public.plot_operations add column if not exists operator text;

do $$ begin
  alter table public.plot_operations add constraint plot_operations_target_check
    check (target is null or char_length(target) between 1 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plot_operations add constraint plot_operations_operator_check
    check (operator is null or char_length(operator) between 1 and 80);
exception when duplicate_object then null; end $$;
