-- Since 30 October 2026, new tables in public get no automatic grants, and that
-- includes service_role, which the monitor's secret key uses. anon and
-- authenticated get nothing: this data is only read by the script.
grant select, insert, update, delete on table
  public.sources,
  public.runs,
  public.snapshots,
  public.change_events,
  public.robots_cache,
  public.links_seen,
  public.opportunities,
  public.opportunity_events
to service_role;

-- A table grant doesn't cover its identity sequence.
grant usage, select on all sequences in schema public to service_role;
