-- 019: a version on the harvests document (docs/idempotency-plan.md IDEM-12, docs/failure-handling-plan.md FAIL-14).
-- save_harvests replaces the whole document. A phone with an old copy, or a save that waited offline,
-- would overwrite what another device saved. The phone sends the version its copy had (If-Match);
-- the API saves only when it is still the current one and moves it up by one, otherwise 409.
-- Safe to run again.

alter table public.farmers add column if not exists harvests_version int not null default 0
  check (harvests_version >= 0);

-- The farmer writes it together with harvests (RLS on farmers already limits the row to their own).
grant update (harvests_version) on table public.farmers to authenticated;
