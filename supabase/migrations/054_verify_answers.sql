-- 054_verify_answers.sql — the answers to „De verificat” (docs/admin-verificari-plan.md, step 3). Safe to run again.
--
-- verify_answers   one row per answer an admin gives to a to-check item: a DE-VERIFICAT figure in docs/data or
--                  an item of docs/11-open-questions.md. The items themselves aren't stored: they come from the
--                  files of the running version, so the list and the code can't disagree.
--                  Answers are added, never changed: no update or delete grant, not even for the service role.
--
-- The API writes with the service role after its own admin check (requireAdmin, like /admin's publish).
-- Admins (app_roles, migration 035) can also read the table directly; nobody else sees a row.

create table if not exists public.verify_answers (
  id uuid primary key default gen_random_uuid(),
  item_key text not null check (char_length(item_key) between 3 and 400),
  verdict text not null check (verdict in ('confirmed', 'wrong', 'open', 'not_needed')),
  new_value jsonb,
  source_url text check (source_url is null or (source_url ~ '^https://\S+$' and char_length(source_url) <= 1000)),
  note text not null check (char_length(btrim(note)) between 3 and 2000),
  by_user uuid references auth.users (id) on delete set null,
  by_email text,
  at timestamptz not null default now(),
  -- A confirmed or wrong answer names its source.
  constraint verify_answers_source check (verdict not in ('confirmed', 'wrong') or source_url is not null),
  -- Only a wrong answer carries a value, wrapped as {"v": …} so "the right answer is: no figure" ({"v": null})
  -- isn't lost: a bare JSON null reaches Postgres as SQL null.
  constraint verify_answers_value check (
    (verdict = 'wrong' and new_value is not null and jsonb_typeof(new_value) = 'object' and new_value ? 'v')
    or (verdict <> 'wrong' and new_value is null)
  )
);

create index if not exists verify_answers_item_at on public.verify_answers (item_key, at desc);

alter table public.verify_answers enable row level security;
drop policy if exists verify_answers_admin_read on public.verify_answers;
create policy verify_answers_admin_read on public.verify_answers for select to authenticated
  using (public.is_admin());

revoke all on table public.verify_answers from anon, authenticated, service_role;
grant select on table public.verify_answers to authenticated;
grant select, insert on table public.verify_answers to service_role;
