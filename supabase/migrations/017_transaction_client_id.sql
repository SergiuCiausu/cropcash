-- 017: a sale or expense sent twice is saved once.
-- The phone gives each sale and expense a random id (client_id) before the first send. If the answer
-- is lost and the outbox sends it again, the server finds the row it already has and returns it.

alter table public.transactions add column if not exists client_id uuid;

create unique index if not exists transactions_farmer_client_id
  on public.transactions (farmer_id, client_id)
  where client_id is not null;

-- record_expense gains p_client_id. The old 7-argument version is dropped, so there is one to call.
drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind, int);
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
