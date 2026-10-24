-- A source is identified by commit, branch, and repository,
-- so that a commit benchmarked on multiple branches gets a source per branch.
ALTER TABLE Source
  DROP CONSTRAINT source_commitid_key,
  ADD CONSTRAINT source_commitid_branchortag_repourl_key
    UNIQUE NULLS NOT DISTINCT (commitId, branchOrTag, repoURL);

-- With more sources, the smallint sourceId would overflow sooner.
ALTER TABLE Trial
  ALTER COLUMN sourceId TYPE integer;

-- Make PK and FK types consistent.
ALTER TABLE Experiment
  ALTER COLUMN projectId TYPE integer;

ALTER TABLE Trial
  ALTER COLUMN expId TYPE integer,
  ALTER COLUMN envId TYPE integer;

ALTER TABLE SoftwareUse
  ALTER COLUMN envId TYPE integer,
  ALTER COLUMN softId TYPE integer;

-- There are few criteria, and Measurement is large,
-- so we narrow the id instead of widening Measurement.criterion.
ALTER SEQUENCE criterion_id_seq AS smallint;
ALTER TABLE Criterion
  ALTER COLUMN id TYPE smallint;

-- An `environment` can change over time.
ALTER TABLE Environment
  DROP CONSTRAINT environment_hostname_key,
  ADD CONSTRAINT environment_hostname_ostype_memory_cpu_clockspeed_key
    UNIQUE NULLS NOT DISTINCT (hostname, osType, memory, cpu, clockSpeed);

UPDATE SchemaVersion SET version = 20;
