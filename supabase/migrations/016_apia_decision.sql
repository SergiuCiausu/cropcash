-- The total from the farmer's APIA payment decision. Safe to run again.
-- It replaces the estimate in the plan. It's money expected, never money received, so it doesn't
-- touch transactions. The file the farmer uploads isn't stored anywhere.
alter table farmers add column if not exists apia_decision jsonb
  check (
    apia_decision is null
    or (
      jsonb_typeof(apia_decision) = 'object'
      and jsonb_typeof(apia_decision->'campaignYear') = 'number'
      and jsonb_typeof(apia_decision->'totalBani') = 'number'
      and (apia_decision->>'totalBani')::numeric > 0
    )
  );
grant update (apia_decision) on table public.farmers to authenticated;
