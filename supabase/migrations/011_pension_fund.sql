-- The Pilon III fund the farmer picked. The list and its minimums live in
-- docs/data/pension-funds.json, so the API checks the id, not the database.
alter table farmers add column if not exists pension_fund_id text;
