-- Farm costs paid during "Dăm timpul înainte" (from the farmer's own bank, not via Stripe)
-- are recorded too, so the plan stops counting money that has already been spent.
alter table transactions drop constraint transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('apia_advance', 'apia_balance', 'crop_sale', 'salary', 'pension', 'expense'));
