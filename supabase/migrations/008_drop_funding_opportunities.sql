-- The funding radar now uses the monitor's `opportunities` table (006).
-- The placeholder table from 001 was never written to.
drop table if exists public.funding_opportunities;

-- Tighten 001: the helper is only useful to signed-in users.
revoke execute on function public.my_farmer_ids() from anon;
