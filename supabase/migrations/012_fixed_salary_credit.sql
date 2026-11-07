-- Step 9: the monthly salary is fixed when the farmer accepts the plan ("Bine așa", or a
-- declared credit). Each month we pay min(fixed, safe salary): it never grows on its own,
-- but goes down if the money would run out. NULL = not fixed yet (pay the safe salary).
alter table farmers add column salary_bani bigint check (salary_bani >= 0);
-- Set by the API from the computed plan, as the user. Paying more than the safe salary is
-- impossible anyway (the payout takes the minimum), so the farmer may hold this column.
grant update (salary_bani) on farmers to authenticated;

-- In the demo a declared credit arrives in the CropCash account like an APIA payment, and
-- its repayment is recorded when the clock passes it (from the farmer's bank, no Stripe).
-- transactions.expected_payment_id links both to the declared row, so the plan stops
-- counting them as still to come.
alter table transactions drop constraint transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('apia_advance', 'apia_balance', 'crop_sale', 'salary', 'pension', 'expense', 'credit', 'loan_repayment'));
