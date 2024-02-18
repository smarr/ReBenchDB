-- This migration denormalizes the Run table by adding the benchmark, suite, and executor columns.
-- add new columns
ALTER TABLE Run ADD COLUMN benchmark varchar DEFAULT NULL;
ALTER TABLE Run ADD COLUMN suite     varchar DEFAULT NULL;
ALTER TABLE Run ADD COLUMN executor  varchar DEFAULT NULL;

-- update the new columns based on the existing data
UPDATE Run SET benchmark = Benchmark.name FROM Benchmark WHERE Run.benchmarkId = Benchmark.id;
UPDATE Run SET suite = Suite.name FROM Suite WHERE Run.suiteId = Suite.id;
UPDATE Run SET executor = Executor.name FROM Executor WHERE Run.execId = Executor.id;

-- make the new columns not null
ALTER TABLE Run ALTER COLUMN suite SET NOT NULL;
ALTER TABLE Run ALTER COLUMN executor SET NOT NULL;
ALTER TABLE Run ALTER COLUMN benchmark SET NOT NULL;

-- remove the old id columns
ALTER TABLE Run DROP COLUMN benchmarkId;
ALTER TABLE Run DROP COLUMN suiteId;
ALTER TABLE Run DROP COLUMN execId;

-- remove foreign keys
ALTER TABLE Run DROP CONSTRAINT IF EXISTS run_benchmarkid_fkey;
ALTER TABLE Run DROP CONSTRAINT IF EXISTS run_suiteid_fkey;
ALTER TABLE Run DROP CONSTRAINT IF EXISTS run_execid_fkey;

-- remove the old tables
DROP TABLE Benchmark;
DROP TABLE Suite;
DROP TABLE Executor;
