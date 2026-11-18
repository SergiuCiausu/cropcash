-- 047: a stale edit of a kept cerere is refused at once instead of hanging. Safe to run again.
--
-- 041's update_cerere refused a write made on an older version with SQLSTATE 40001 (serialization_failure).
-- PostgREST retries a transaction that fails with 40001, so the same refused write was sent again and again
-- until the client gave up (found on 2026-11-18, the first run of tests/integration/farm-documents.test.ts on the
-- real Supabase). PT409 is PostgREST's way to answer HTTP 409 straight away. The hint stays 'stale', and the API
-- (documentsRefusal) goes by the hint. The function is otherwise 041's, unchanged.

create or replace function public.update_cerere(
  p_farmer_id uuid,
  p_document_id uuid,
  p_version int,
  p_fields jsonb,
  p_rows jsonb,
  p_status text default null
) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_doc farm_documents%rowtype;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  select * into v_doc from farm_documents where id = p_document_id and farmer_id = p_farmer_id for update;
  if not found or v_doc.kind <> 'apia_cerere' then
    raise exception 'unknown document' using errcode = 'P0002';
  end if;
  if v_doc.version <> p_version then
    raise exception 'the cerere changed since it was read' using errcode = 'PT409', hint = 'stale';
  end if;
  if p_status is not null and p_status not in ('to_check', 'checked') then
    raise exception 'status % is not set here', p_status using errcode = '22023';
  end if;
  if p_fields is not null then
    perform public.cerere_write_fields(p_document_id, p_farmer_id, p_fields);
  end if;
  if p_rows is not null then
    perform public.cerere_write_rows(p_document_id, p_farmer_id, p_rows);
  end if;
  update farm_documents set
    version = version + 1,
    updated_at = now(),
    -- An applied cerere stays applied; „Am verificat” only moves it forward from to_check.
    status = case when p_status is not null and status <> 'applied' then p_status else status end
  where id = p_document_id
  returning version into v_doc.version;
  return v_doc.version;
end $$;
revoke all on function public.update_cerere(uuid, uuid, int, jsonb, jsonb, text) from public, anon;
grant execute on function public.update_cerere(uuid, uuid, int, jsonb, jsonb, text) to authenticated;
