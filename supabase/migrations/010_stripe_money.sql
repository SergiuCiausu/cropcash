-- Step 6: money moved through Stripe (test mode) and the demo clock.

-- The demo clock: the farmer's Stripe Test Clock time, used as "today" by the app.
alter table farmers add column demo_now timestamptz;

-- What each recorded movement is (income, salary or pension contribution).
alter table transactions add column kind text
  check (kind in ('apia_advance', 'apia_balance', 'crop_sale', 'salary', 'pension'));
alter table transactions add column crop_id text;

-- ── Only the server writes money records and Stripe ids ─────────────────────
-- Farmers may still edit their own profile fields, but not Stripe ids or the clock.
revoke update on farmers from authenticated;
grant update (name, county, birth_year, start_balance_bani, dairy_cows, beef_cattle) on farmers to authenticated;
-- Movements, salary payouts and the pension plan are written with the service key.
revoke insert, update, delete on transactions from authenticated;
revoke insert, update, delete on payouts from authenticated;
revoke insert, update, delete on pension_plans from authenticated;
revoke all on transactions, payouts, pension_plans from anon;

-- ── Envelopes can't hold more than the farmer's money ───────────────────────
-- Money = start balance + every recorded movement (income +, salary and pension −).
create or replace function public.set_envelopes(p_balances jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer farmers%rowtype;
  v_total bigint := 0;
  v_available bigint;
  v_kind envelope_kind;
  v_value bigint;
begin
  select * into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;

  foreach v_kind in array enum_range(null::envelope_kind) loop
    v_value := coalesce((p_balances->>v_kind::text)::bigint, 0);
    if v_value < 0 then
      raise exception 'envelope % is negative', v_kind using errcode = '22023';
    end if;
    v_total := v_total + v_value;
  end loop;

  v_available := v_farmer.start_balance_bani
    + coalesce((select sum(amount_bani) from transactions where farmer_id = v_farmer.id), 0);
  if v_total > v_available then
    raise exception 'split exceeds available money' using errcode = '22023';
  end if;

  update envelopes e
     set balance_bani = coalesce((p_balances->>e.kind::text)::bigint, 0)
   where e.farmer_id = v_farmer.id;
end $$;
