-- 027: what the accountant needs on each sale and expense (docs/rapoarte-pdf-plan.md §5), and the
-- litres on a diesel expense for the excise refund (docs/04-farmer-reports.md §1). All optional, so
-- old rows and old phones keep working. Litres are hundredths, as an integer: 120,5 l = 12050.
-- The API writes them right after the row is made (record_expense stays as in 024), so the farmer
-- gets UPDATE on these three columns only (below). Safe to run again.

alter table public.transactions
  add column if not exists doc_no text check (doc_no is null or char_length(doc_no) between 1 and 60),
  add column if not exists counterparty text check (counterparty is null or char_length(counterparty) between 1 and 120),
  add column if not exists fuel_liters_cl integer check (fuel_liters_cl is null or fuel_liters_cl between 1 and 10000000);

-- Only the farmer's own records carry these.
alter table public.transactions drop constraint if exists transactions_documents_manual;
alter table public.transactions add constraint transactions_documents_manual
  check ((doc_no is null and counterparty is null and fuel_liters_cl is null) or kind in ('sale', 'expense'));

-- 012 took UPDATE away from signed-in users. The API sets these three columns on the row
-- record_expense just made, so they (and only they) can be changed, on the farmer's own records.
grant update (doc_no, counterparty, fuel_liters_cl) on table public.transactions to authenticated;
drop policy if exists transactions_update_documents on transactions;
create policy transactions_update_documents on transactions as restrictive for update to authenticated
  using (source = 'manual' and kind in ('sale', 'expense'))
  with check (source = 'manual' and kind in ('sale', 'expense'));
