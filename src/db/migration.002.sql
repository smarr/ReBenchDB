ALTER TABLE Run ALTER COLUMN warmup TYPE int;
ALTER TABLE Run ALTER COLUMN maxInvocationTime TYPE int;
ALTER TABLE Run ALTER COLUMN minIterationTime TYPE int;
ALTER TABLE Timeline ALTER COLUMN numSamples TYPE int;

-- details on system settings that influence noise level for measurements
ALTER TABLE Trial ADD COLUMN denoise jsonb;

-- set sensible defaults for projects
ALTER TABLE Project ALTER COLUMN showChanges SET DEFAULT true;
ALTER TABLE Project ALTER COLUMN allResults SET DEFAULT false;
