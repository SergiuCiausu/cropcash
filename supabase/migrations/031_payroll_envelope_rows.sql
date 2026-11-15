-- 031: every farm gets its 'payroll' envelope (the value was added in 030). Safe to run again.
-- New farms get it from create_farm, which makes one envelope per enum value. Without the row, set_envelopes
-- would count the payroll part of a split against the money but store it nowhere.

insert into public.envelopes (farmer_id, kind)
select f.id, 'payroll'::public.envelope_kind
  from public.farmers f
 where not exists (select 1 from public.envelopes e where e.farmer_id = f.id and e.kind = 'payroll');
