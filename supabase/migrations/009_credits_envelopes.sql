-- Step 5: declared credits (a credit and its repayment share a group_id) and
-- saving the envelope split.

alter table expected_payments add column group_id uuid;
create index on expected_payments (farmer_id, group_id);

-- Sets the caller's envelope balances in one go. The split can't exceed the money the
-- farmer has (start balance for now; received income is added in step 6).
-- SECURITY INVOKER: RLS applies to every read and write.
create function public.set_envelopes(p_balances jsonb) returns void
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer farmers%rowtype;
  v_total bigint := 0;
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

  if v_total > v_farmer.start_balance_bani then
    raise exception 'split exceeds available money' using errcode = '22023';
  end if;

  update envelopes e
     set balance_bani = coalesce((p_balances->>e.kind::text)::bigint, 0)
   where e.farmer_id = v_farmer.id;
end $$;

revoke all on function public.set_envelopes(jsonb) from public, anon;
grant execute on function public.set_envelopes(jsonb) to authenticated;
