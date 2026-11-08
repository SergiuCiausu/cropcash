-- 018: money operations that are safe to run twice (docs/idempotency-plan.md, step 12 in docs/10-plan.md).

-- ── M2: one money operation at a time per farm ─────────────────────────────────
-- PostgREST runs every call in its own transaction, so a session advisory lock can't span the
-- Stripe calls. A lease row with an expiry can: a crashed holder's lease simply runs out.
create table if not exists public.farm_leases (
  farmer_id uuid not null references farmers(id) on delete cascade,
  op text not null,
  holder uuid not null,
  expires_at timestamptz not null,
  primary key (farmer_id, op)
);
alter table public.farm_leases enable row level security;
-- No policies: only the service key (the API) touches it.

create or replace function public.take_farm_lease(p_farmer uuid, p_op text, p_holder uuid, p_ttl_s int)
returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_holder uuid;
begin
  insert into farm_leases as l (farmer_id, op, holder, expires_at)
  values (p_farmer, p_op, p_holder, now() + make_interval(secs => p_ttl_s))
  on conflict (farmer_id, op) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where l.expires_at < now()
  returning holder into v_holder;
  return v_holder is not null and v_holder = p_holder;
end $$;

create or replace function public.release_farm_lease(p_farmer uuid, p_op text, p_holder uuid)
returns void
  language sql security invoker set search_path = public
as $$
  delete from farm_leases where farmer_id = p_farmer and op = p_op and holder = p_holder;
$$;

revoke all on function public.take_farm_lease(uuid, text, uuid, int) from public, anon, authenticated;
revoke all on function public.release_farm_lease(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.take_farm_lease(uuid, text, uuid, int) to service_role;
grant execute on function public.release_farm_lease(uuid, text, uuid) to service_role;

-- ── IDEM-01: a salary is claimed before Stripe pays it ─────────────────────────
-- 'creating' = the row exists, the Stripe payout may or may not. A retry finds it and doesn't pay again.
alter table public.payouts drop constraint if exists payouts_status_check;
alter table public.payouts add constraint payouts_status_check
  check (status in ('scheduled', 'creating', 'pending', 'paid', 'failed'));

-- ── IDEM-02 / IDEM-06: pension start key, and a stop that can be resumed ───────
-- start_key is the phone's key for "start the pension": the same key sent again gets the same answer.
-- status 'stopping' = asked Stripe to cancel, not yet confirmed here.
alter table public.pension_plans add column if not exists start_key uuid;

-- ── IDEM-07: a credit sent twice with the same group_id is saved once ──────────
create unique index if not exists expected_payments_credit_group
  on public.expected_payments (farmer_id, group_id, kind)
  where group_id is not null and kind in ('credit', 'loan_repayment');

-- ── IDEM-05: two concurrent sends of one expense ───────────────────────────────
-- Both used to miss the select by client_id and the second insert failed with 23505 (a 500).
-- A transaction lock on the client id makes the second one wait, then return the saved row.
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  -- Sent before: return the saved row and take nothing from the envelope again.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    select id into v_id from transactions where farmer_id = v_farmer and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;

  if p_envelope is not null then
    select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
      from envelopes where farmer_id = v_farmer and kind = p_envelope for update;
    update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  end if;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note, envelope_taken_bani, harvest_year, client_id)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, p_crop_id, p_note, coalesce(v_taken, 0), p_harvest_year, p_client_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid) to authenticated;
