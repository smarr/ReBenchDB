ALTER TABLE Run ALTER COLUMN warmup TYPE int;
ALTER TABLE Run ALTER COLUMN maxInvocationTime TYPE int;
ALTER TABLE Run ALTER COLUMN minIterationTime TYPE int;
ALTER TABLE Timeline ALTER COLUMN numSamples TYPE int;

-- details on system settings that influence noise level for measurements
ALTER TABLE Trial ADD COLUMN denoise jsonb;

-- set sensible defaults for projects
ALTER TABLE Project ALTER COLUMN showChanges SET DEFAULT true;
ALTER TABLE Project ALTER COLUMN allResults SET DEFAULT false;

-- add the TimelineCalcJob table
CREATE SEQUENCE TimelineJobId AS smallint CYCLE;

CREATE TABLE TimelineCalcJob (
  timelineJobId smallint NOT NULL DEFAULT nextval('TimelineJobId') PRIMARY KEY,
  trialId   smallint,
  runId     smallint,
  criterion smallint
);

ALTER SEQUENCE TimelineJobId OWNED BY TimelineCalcJob.timelineJobId;
