-- 021: expense categories renamed. "Reparații" (repairs) is folded into "Construcții" (constructions);
-- repairs to machinery now have their own "Service" (machine_service). The category column is plain
-- text with no check, so only the stored rows change. The API still accepts 'repairs' from phones
-- that queued an expense offline before the update (expenseCategory in packages/shared).
-- Safe to run again.

update public.transactions set category = 'constructions' where category = 'repairs';
