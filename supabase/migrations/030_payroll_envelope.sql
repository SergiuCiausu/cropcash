-- 030: the people's pay in the plan (docs/employees-arenda-plan.md §1.3–1.4). Safe to run again.
--
-- envelope_kind 'payroll'  "Salariile oamenilor": the split puts the pay due before the next income here,
--                          after debts and before the pension and the farmer's salary. Postgres can't use a new
--                          enum value in the transaction that adds it, and the migration runner wraps each file
--                          in one, so the envelope rows for existing farms come in 031.
-- farmers.own_field_work   „Lucrările pe câmp le fac oamenii tăi?” (decision D3). Null: not asked yet. Yes makes the
--                          app ask for the farmer's own cost per ha, so field work isn't counted twice.

alter type public.envelope_kind add value if not exists 'payroll';

alter table public.farmers add column if not exists own_field_work boolean;
-- Since 012 the farmer may update only the columns granted one by one.
grant update (own_field_work) on table public.farmers to authenticated;
