-- 038: employees gets the grants 026 meant it to have. Safe to run again.
--
-- 026 granted `select, insert, update` to authenticated ("No delete: people are archived"), assuming new tables
-- get no automatic grants. On this project they still did when 026 ran (15 Nov 2026): anon and authenticated
-- got every privilege, delete and truncate included. RLS kept other farms out, but a farm's owner or manager
-- could delete a person straight through the REST API, and their past pay would lose its name
-- (tests/integration/rls.test.ts, "people are never deleted").
--
-- Other tables carry the same automatic grants; RLS is on for all of them and none gives anon a write policy.
-- Tightening those is a separate change (docs/workspaces-plan.md §7).

revoke all on table public.employees from anon;
revoke delete, truncate, references, trigger on table public.employees from authenticated;
grant select, insert, update on table public.employees to authenticated;
