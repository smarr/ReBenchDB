-- The PK is wrongly ordered and makes queries for getting measurements very slow
-- because we end up scanning through all of the table.
ALTER TABLE Measurement 
  DROP CONSTRAINT measurement_pkey,
  ADD CONSTRAINT measurement_pkey PRIMARY KEY (runid, trialid, criterion, invocation);

ALTER TABLE ProfileData
  DROP CONSTRAINT profiledata_pkey,
  ADD CONSTRAINT profiledata_pkey PRIMARY KEY (runid, trialid, numiterations, invocation);
