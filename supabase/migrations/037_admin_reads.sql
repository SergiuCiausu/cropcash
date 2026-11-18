-- 037_admin_reads.sql — what an admin reads in /admin → „Oportunități și surse”
-- (docs/admin-opportunities-plan.md, step 2; the plan called it 036, which another migration took). Safe to run again.
--
-- The monitor's own tables (sources, runs, change_events) had RLS on and no policies: only its secret key
-- reached them. Admins (app_roles, migration 035) now read them too; everyone else still gets zero rows.
-- snapshots, robots_cache and links_seen stay locked: they're the monitor's internals.
--
-- admin_source_health   every official source with its state and the last thing the monitor saw on it.
-- admin_opportunities   every funding call, including the ones farmers never see (not_relevant), with how
--                       many changes it had and how many farms follow it.
-- Both views are security_invoker, so the caller's RLS applies, and they also filter on is_admin():
-- opportunities are readable by every farmer, but this view of them is for admins only.
-- The monitor keeps writing with the service role, untouched.

-- ── Admin-only reads of the monitor's tables ─────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['sources', 'runs', 'change_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;

-- The latest event per source, for admin_source_health.
create index if not exists change_events_source_recent_idx on public.change_events (source_id, created_at desc);

-- ── Follower counts ────────────────────────────────────────────────────────────
-- opportunity_follows is per farm under RLS, so an admin's own session would only count their own farm.
-- This counts every farm, but answers only an admin, and only with numbers (no farm ids).

create or replace function public.admin_opportunity_followers()
  returns table (stable_key text, followers int)
  language sql stable security definer set search_path = public
as $$
  select f.stable_key, count(*)::int
  from public.opportunity_follows f
  where public.is_admin()
  group by f.stable_key
$$;
revoke all on function public.admin_opportunity_followers() from public, anon;
grant execute on function public.admin_opportunity_followers() to authenticated, service_role;

-- ── Views ──────────────────────────────────────────────────────────────────────

create or replace view public.admin_source_health with (security_invoker = on) as
select
  s.id,
  s.institution,
  s.title,
  s.url,
  s.type,
  s.frequency,
  s.state,
  s.last_checked,
  s.next_due,
  s.failure_count,
  s.discovered_from,
  e.kind as last_event_kind,
  e.detail as last_event_detail,
  e.created_at as last_event_at
from public.sources s
left join lateral (
  select ce.kind, ce.detail, ce.created_at
  from public.change_events ce
  where ce.source_id = s.id
  order by ce.created_at desc
  limit 1
) e on true
where public.is_admin();

create or replace view public.admin_opportunities with (security_invoker = on) as
select
  o.stable_key,
  o.kind,
  o.programme,
  o.title,
  o.status,
  o.source_state,
  o.open_date,
  o.deadline,
  o.budget_eur,
  o.applicants,
  o.region,
  o.url,
  o.relevance,
  o.relevance_note,
  o.confidence,
  o.evidence,
  o.first_seen,
  coalesce(ev.changes, 0) as changes,
  ev.last_change_at,
  coalesce(f.followers, 0) as followers
from public.opportunities o
left join lateral (
  select count(*)::int as changes, max(oe.created_at) as last_change_at
  from public.opportunity_events oe
  where oe.opportunity_id = o.id
) ev on true
left join public.admin_opportunity_followers() f on f.stable_key = o.stable_key
where public.is_admin();

revoke all on table public.admin_source_health, public.admin_opportunities from anon;
grant select on table public.admin_source_health, public.admin_opportunities to authenticated;
grant select on table public.admin_source_health, public.admin_opportunities to service_role;
