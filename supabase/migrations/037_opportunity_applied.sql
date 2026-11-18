-- 037_opportunity_applied.sql: the farmer says they filed an application for a call
-- (docs/ce-mai-poti-primi-plan.md, part 3). Safe to run again.
--
-- A followed call is 'following'. 'applied' keeps it in the calendar but stops its closing-soon
-- alerts, and leaves it out of „Ce mai poți primi” on Subvenții. A call can be marked applied
-- without being followed first, so applying doesn't need a deadline.
--
-- RLS: opportunity_follows_own (036) is `for all` on the farmer's own rows, so it already covers
-- update. Only the grant was missing (013 granted select, insert and delete).

alter table public.opportunity_follows
  add column if not exists status text not null default 'following',
  add column if not exists applied_at timestamptz;

alter table public.opportunity_follows drop constraint if exists opportunity_follows_status_check;
alter table public.opportunity_follows
  add constraint opportunity_follows_status_check check (status in ('following', 'applied'));

-- applied_at goes with the status, so the two can't disagree.
alter table public.opportunity_follows drop constraint if exists opportunity_follows_applied_at_check;
alter table public.opportunity_follows
  add constraint opportunity_follows_applied_at_check check ((status = 'applied') = (applied_at is not null));

grant update (status, applied_at) on table public.opportunity_follows to authenticated;
