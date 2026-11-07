-- F5: money moved through Stripe (test mode), and the demo clock.
-- Safe to run again.

-- The date the app believes it is, set by the demo clock. Null means today.
alter table farmers add column if not exists app_date date;

-- ── Only the server writes money facts ────────────────────────────────────
-- RLS alone let a signed-in farmer edit their own Stripe ids, salaries and income rows.

revoke insert, update on table public.farmers from authenticated;
grant insert (user_id, name, birth_year, county, dairy_cows, beef_cattle, start_balance_bani, pension_fund_id)
  on table public.farmers to authenticated;
grant update (name, birth_year, county, dairy_cows, beef_cattle, start_balance_bani, pension_fund_id)
  on table public.farmers to authenticated;

revoke insert, update, delete on table public.payouts from authenticated;
revoke insert, update, delete on table public.pension_plans from authenticated;

revoke update on table public.transactions from authenticated;
drop policy if exists transactions_insert_manual on transactions;
create policy transactions_insert_manual on transactions as restrictive for insert to authenticated
  with check (source = 'manual' and stripe_object_id is null);
drop policy if exists transactions_delete_manual on transactions;
create policy transactions_delete_manual on transactions as restrictive for delete to authenticated
  using (source = 'manual');

-- ── Money in the envelopes ────────────────────────────────────────────────
-- Everything the farmer holds, pension savings included. Replaces the one from 010.
create or replace function public.farmer_money(p_farmer uuid) returns bigint
  language sql stable security invoker set search_path = public
as $$
  select f.start_balance_bani + coalesce(
    (select sum(t.amount_bani) from transactions t
      where t.farmer_id = f.id and (t.kind is not null or t.source in ('stripe_transfer', 'payout'))), 0)
  from farmers f where f.id = p_farmer
$$;

-- Replaces the one from 010: FOR UPDATE needs a right farmers no longer have here, and
-- deleting first is atomic, so two taps can't restore the envelope twice.
create or replace function public.undo_transaction(p_id uuid) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_tx transactions%rowtype;
begin
  delete from transactions where id = p_id and kind is not null returning * into v_tx;
  if not found then
    return false;
  end if;
  if v_tx.envelope_id is not null then
    update envelopes set balance_bani = balance_bani + v_tx.envelope_taken_bani where id = v_tx.envelope_id;
  end if;
  return true;
end $$;

-- ── Called by the server only. Each is safe to repeat for the same Stripe object ──

create or replace function public.apply_income(
  p_farmer uuid, p_amount_bani bigint, p_at timestamptz, p_category text, p_crop_id text, p_object text
) returns boolean
  language plpgsql security invoker set search_path = public
as $$
begin
  insert into transactions (farmer_id, amount_bani, occurred_at, source, category, crop_id, stripe_object_id)
  values (p_farmer, p_amount_bani, p_at, 'stripe_transfer', p_category, p_crop_id, p_object)
  on conflict (stripe_object_id) do nothing;
  return found;
end $$;

-- A salary left: mark it paid and take it from the salary envelope, as far as it goes.
create or replace function public.apply_payout_paid(p_stripe_payout text) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_payout payouts%rowtype;
  v_envelope uuid;
  v_taken bigint;
begin
  update payouts set status = 'paid'
   where stripe_payout_id = p_stripe_payout and status <> 'paid'
  returning * into v_payout;
  if not found then
    return false;
  end if;

  select id, least(balance_bani, v_payout.amount_bani) into v_envelope, v_taken
    from envelopes where farmer_id = v_payout.farmer_id and kind = 'salary' for update;
  update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, category, stripe_object_id, envelope_taken_bani)
  values (v_payout.farmer_id, v_envelope, -v_payout.amount_bani, (v_payout.scheduled_for + time '12:00') at time zone 'UTC',
          'payout', 'salary', p_stripe_payout, coalesce(v_taken, 0));
  return true;
end $$;

-- A pension payment: the money is still the farmer's, in the pension envelope.
create or replace function public.apply_invoice_paid(
  p_farmer uuid, p_amount_bani bigint, p_at timestamptz, p_invoice text
) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_envelope uuid;
begin
  select id into v_envelope from envelopes where farmer_id = p_farmer and kind = 'pension' for update;
  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, category, stripe_object_id)
  values (p_farmer, v_envelope, -p_amount_bani, p_at, 'subscription', 'pension', p_invoice)
  on conflict (stripe_object_id) do nothing;
  if not found then
    return false;
  end if;
  update envelopes set balance_bani = balance_bani + p_amount_bani where id = v_envelope;
  return true;
end $$;

-- Demo clock: a cost the plan expected in a month that was skipped.
create or replace function public.apply_planned_cost(
  p_farmer uuid, p_amount_bani bigint, p_date date, p_crop_id text, p_note text, p_key text
) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_envelope uuid;
  v_taken bigint;
begin
  if exists (select 1 from transactions where stripe_object_id = p_key) then
    return false;
  end if;
  select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
    from envelopes where farmer_id = p_farmer and kind = 'spring_inputs' for update;
  update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note, stripe_object_id, envelope_taken_bani)
  values (p_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          'field_work', p_crop_id, p_note, p_key, coalesce(v_taken, 0));
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'apply_income(uuid, bigint, timestamptz, text, text, text)',
    'apply_payout_paid(text)',
    'apply_invoice_paid(uuid, bigint, timestamptz, text)',
    'apply_planned_cost(uuid, bigint, date, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
