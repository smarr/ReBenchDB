-- After migration.015.sql, the PKs are not optimal
-- for report generation. For all other queries, this order
-- of trialId and runId should be fine, too
CREATE INDEX trial_sourceid_idx ON Trial (sourceId);

ALTER TABLE Measurement
  DROP CONSTRAINT measurement_pkey,
  ADD CONSTRAINT measurement_pkey PRIMARY KEY (trialId, runId, criterion, invocation);

ALTER TABLE ProfileData
  DROP CONSTRAINT profiledata_pkey,
  ADD CONSTRAINT profiledata_pkey PRIMARY KEY (trialId, runId, numIterations, invocation);
