-- The PK is wrongly ordered and makes queries for getting measurements very slow
-- because we end up scanning through all of the table.
ALTER TABLE public.measurement 
  DROP CONSTRAINT measurement_pkey,
  ADD CONSTRAINT measurement_pkey PRIMARY KEY (runid, trialid, criterion, invocation);
