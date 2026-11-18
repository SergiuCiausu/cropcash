-- 043: the one-farm SQL signatures go (docs/workspaces-plan.md step 8). Safe to run again.
--
-- 036 kept the four functions' old signatures, without p_farmer_id, acting on only_farm() (the one farm where the
-- caller is owner or manager) until the API sent the farm. It has since step 3, and nothing calls them any more:
-- not the API (apps/api/src/db: every call names p_farmer_id), not the scripts, not another function (checked on
-- the live database 2026-11-17: only the shims themselves call only_farm or the old forms). The versions that
-- take the farm and check the caller's role on it (036) stay.
--
-- After this, no function or policy finds "my farm" through `farmers.user_id = auth.uid()`. What still reads
-- user_id = auth.uid(), and why it is not a farm lookup:
--   farmers_own (farmers)          the owner's own row: user_id is the owner, kept so by transfer_farm (040); it
--                                  lets the creator insert a farm and read it back before the owner's
--                                  membership row (035's trigger) exists
--   create_farm (039)              finds the farm this account already made for the same tap (client_id)
--   farm_members_self, profiles_*, app_roles_read_own, my_farm_ids, require_farm_role, my_employee_id
--                                  read the caller's own membership, profile or roles; the farm comes from the row

drop function if exists public.set_envelopes(jsonb);
drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text, uuid);
drop function if exists public.update_farm(text, text, int, jsonb, bigint);
drop function if exists public.save_plots(int, jsonb);
drop function if exists public.only_farm();

-- PostgREST keeps a schema cache; without this the old names answer until it reloads on its own.
notify pgrst, 'reload schema';
