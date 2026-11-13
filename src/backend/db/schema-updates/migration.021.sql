-- Memory, clock speed, and software versions are not stable for a machine.
-- To allow comparisons between drifting details, move them to Trial.
-- Merge otherwise identical environments.
--
-- SoftwareUse and the notes of environments were not yet used,
-- and are expected to be empty.
-- If they are not, the migration fails, instead of dropping data.
--
-- The merge fails on the unique key of Trial, if the same user started
-- the same experiment at the same time in two of the merged environments.
-- The whole migration is then rolled back.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM SoftwareUse) THEN
    RAISE EXCEPTION 'SoftwareUse is not empty, but is expected to be';
  END IF;
  IF EXISTS (SELECT 1 FROM Environment WHERE note <> '') THEN
    RAISE EXCEPTION 'Environment has notes, but is expected to have none';
  END IF;
END $$;

ALTER TABLE Trial
  ADD COLUMN memory bigint,
  ADD COLUMN clockSpeed bigint;

UPDATE Trial t
  SET memory = env.memory, clockSpeed = env.clockSpeed
  FROM Environment env
  WHERE t.envId = env.id;

DROP TABLE SoftwareUse;
CREATE TABLE SoftwareUse (
  trialId integer,
  softId integer,
  primary key (trialId, softId),

  foreign key (trialId) references Trial (id),
  foreign key (softId) references SoftwareVersionInfo (id)
);

-- Map each environment to the oldest one with the same hostname, OS, and CPU.
-- PARTITION BY considers NULL values as equal.
CREATE TEMPORARY TABLE EnvMerge ON COMMIT DROP AS
  SELECT id AS oldId,
         min(id) OVER (PARTITION BY hostname, osType, cpu) AS newId
    FROM Environment;

DELETE FROM EnvMerge WHERE oldId = newId;

UPDATE Trial t
  SET envId = m.newId
  FROM EnvMerge m
  WHERE t.envId = m.oldId;

DELETE FROM Environment env
  USING EnvMerge m
  WHERE env.id = m.oldId;

ALTER TABLE Environment
  DROP CONSTRAINT environment_hostname_ostype_memory_cpu_clockspeed_key,
  DROP COLUMN memory,
  DROP COLUMN clockSpeed,
  ADD CONSTRAINT environment_hostname_ostype_cpu_key
    UNIQUE NULLS NOT DISTINCT (hostname, osType, cpu);

UPDATE SchemaVersion SET version = 21;

COMMIT;
