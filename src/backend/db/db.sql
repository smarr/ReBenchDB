-- A specific software version, possibly used by multiple environments
-- or versions of environments.
CREATE TABLE SoftwareVersionInfo (
  id serial primary key,
  name varchar,
  version varchar,
  unique (name, version)
);

-- Identifies the specific state of an environment, including
-- the relevant software versions.
CREATE TABLE Environment (
  id serial primary key,
  hostname varchar unique,
  osType varchar,
  -- total number of bytes of memory provided by the system
  memory bigint,
  cpu varchar,

  -- nominal clock speed in Hz
  clockSpeed bigint,
  note text
);

-- A specific criterion that is measured for a benchmark.
-- This can be anything, from total time over memory consumption
-- to other things or parts worth measuring.
CREATE TABLE Criterion (
  id serial primary key,
  name varchar,
  unit varchar,

  unique (name, unit)
);

-- Groups all the data that belongs together.
-- ReBenchDB is meant to keep data for multiple experiments.
CREATE TABLE Project (
  id serial primary key,
  name varchar unique,
  slug varchar unique,
  description text,
  logo varchar,
  showChanges bool DEFAULT true,
  allResults bool DEFAULT false,
  githubNotification bool DEFAULT true,

  -- display projects in descending order of position
  position integer DEFAULT 0,

  -- the bases for comparisons that we generate when a experiment is completed
  baseBranch varchar
);

-- Identifies the specific state of the source, the code, on which
-- an experiment and its measurements are based.
CREATE TABLE Source (
  id serial primary key,
  repoURL varchar,
  branchOrTag varchar,
  commitId varchar unique,
  commitMessage text,
  authorName varchar,
  authorEmail varchar,
  committerName varchar,
  committerEmail varchar
);

-- ReBench executes experiments to collect the desired measurements.
-- An experiment can be composed of multiple Trials.
-- To identify experiments, we use a name.
-- Optionally, a more elaborated description can be provided for documentation.
CREATE TABLE Experiment (
  id serial primary key,

  name varchar NOT NULL,
  projectId smallint,

  description text,

  unique (projectId, name),

  foreign key (projectId) references Project (id)
);

-- Is part of an experiment, and consists of measurements.
-- Multiple trials can belong to a single experiment.
-- Trials are something like CI jobs or manual executions to collect
-- all the data for a specific experiment.
CREATE TABLE Trial (
  id serial primary key,
  manualRun bool,
  startTime timestamp with time zone,

  expId smallint,

  username varchar,
  envId smallint,
  sourceId smallint,

  -- details on system settings that influence noise level for measurements
  denoise jsonb,

  -- can only be supplied when everything is done
  -- but we may want to start storing data before
  endTime timestamp with time zone NULL,

  -- We assume that there is only
  -- a single trial per user/environment/startTime/experiment.
  -- sourceId is not included, since it should be
  -- functionally dependent on startTime in the intended scenarios.
  unique (username, envId, expId, startTime),

  foreign key (expId) references Experiment (id),
  foreign key (envId) references Environment (id),
  foreign key (sourceId) references Source (id)
);

-- Documents the software versions used by a specific environment.
CREATE TABLE SoftwareUse (
  envId smallint,
  softId smallint,
  primary key (envId, softId),

  foreign key (envId) references Environment (id),
  foreign key (softId) references SoftwareVersionInfo (id)
);

-- A concrete execution of a benchmark by a specific executor.
-- A run is a specific combination of variables.
-- It can be executed multiple times.
-- Each time is referred to as an invocation.
-- One run itself can also execute a benchmark multiple times,
-- which we refer to as iterations of a run.
CREATE TABLE Run (
  id serial primary key,
  benchmark varchar NOT NULL,
  suite varchar NOT NULL,
  executor varchar NOT NULL,
  cmdline text unique NOT NULL,
  location text,
  varValue varchar,
  cores varchar,
  inputSize varchar,
  extraArgs varchar,
  maxInvocationTime int NOT NULL,
  minIterationTime int NOT NULL,
  warmup int
);

-- One value for one specific criterion.
CREATE TABLE Measurement (
  runId int,
  trialId int,
  criterion smallint,
  invocation smallint,

  values float4[] NOT NULL,

  primary key (invocation, runId, trialId, criterion),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id),
  foreign key (criterion) references Criterion (id)
);

CREATE TABLE ProfileData (
  runId int,
  trialId int,
  invocation smallint,
  numIterations smallint,

  value text NOT NULL,

  primary key (numIterations, invocation, runId, trialId),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id)
);

-- Summary Statistics for comparing over time
CREATE TABLE Timeline (
  runId int,
  trialId int,
  criterion smallint,

  numSamples int,

  minVal float4,
  maxVal float4,
  sdVal  float4,
  mean   float4,
  median float4,

  -- bootstrap confidence interval 95%-tile
  bci95low float4,
  bci95up  float4,

  primary key (runId, trialId, criterion),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id),
  foreign key (criterion) references Criterion (id)
);

-- ============================================================
-- 1. ENUM type for membership roles
-- ============================================================
CREATE TYPE project_role AS ENUM ('view', 'edit', 'owner');

-- ============================================================
-- 2. Application user table
-- ============================================================
CREATE TABLE appuser (
                         id            SERIAL PRIMARY KEY,
                         username      VARCHAR(100) NOT NULL UNIQUE,
                         email         VARCHAR(255) NOT NULL UNIQUE,
                         password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash, always 60 chars
                         created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                         is_active     BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 3. Project membership (user <-> project with role)
-- ============================================================
CREATE TABLE ProjectMembership ( -- TODO: Test what gets deleted when deleting a user
                                   userId    INTEGER NOT NULL REFERENCES appuser(id) ON DELETE CASCADE,
                                   projectId INTEGER NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
                                   role      project_role NOT NULL DEFAULT 'view',
                                   PRIMARY KEY (userId, projectId)
);

CREATE INDEX projectmembership_projectid_idx ON ProjectMembership (projectId);

-- ============================================================
-- 4. Dedicated non-superuser DB role for the application.
--    The backend will SET LOCAL ROLE rdb_app inside each
--    user-facing transaction so that RLS policies fire even
--    when the pool connects as the DB owner / superuser.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rdb_app') THEN
CREATE ROLE rdb_app LOGIN;
END IF;
END$$;

-- ============================================================
-- 5. Enable Row Level Security on all relevant tables.
--    FORCE ensures the table owner / superuser is also filtered
--    when SET LOCAL ROLE rdb_app is in effect.
-- ============================================================
ALTER TABLE Project         ENABLE ROW LEVEL SECURITY;
ALTER TABLE Experiment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE Trial           ENABLE ROW LEVEL SECURITY;
ALTER TABLE Run             ENABLE ROW LEVEL SECURITY;
ALTER TABLE Measurement     ENABLE ROW LEVEL SECURITY;
ALTER TABLE Timeline        ENABLE ROW LEVEL SECURITY;
ALTER TABLE Source          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ProfileData     ENABLE ROW LEVEL SECURITY;

ALTER TABLE Project         FORCE ROW LEVEL SECURITY;
ALTER TABLE Experiment      FORCE ROW LEVEL SECURITY;
ALTER TABLE Trial           FORCE ROW LEVEL SECURITY;
ALTER TABLE Run             FORCE ROW LEVEL SECURITY;
ALTER TABLE Measurement     FORCE ROW LEVEL SECURITY;
ALTER TABLE Timeline        FORCE ROW LEVEL SECURITY;
ALTER TABLE Source          FORCE ROW LEVEL SECURITY;
ALTER TABLE ProfileData     FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 6. Helper function to read the session-local user ID.
--    Returns NULL when not set (allows bypass during migration).
--    SECURITY DEFINER so rdb_app can call current_setting.
-- ============================================================
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS INTEGER
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
SELECT NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
$$;

-- ============================================================
-- 7. RLS policies
--
--    The `app_current_user_id() IS NULL` clause is a temporary
--    bypass so that existing routes (not yet protected by auth
--    middleware) continue to work during the migration period.
--    Remove this clause once all routes enforce authentication.
--
--    Machine-to-machine endpoints (PUT /rebenchdb/results) run
--    as the pool superuser without SET ROLE, so they bypass
--    RLS entirely and are unaffected by these policies.
-- ============================================================

-- Project: direct membership check
CREATE POLICY project_access ON Project
  FOR ALL USING ( -- all operations
    app_current_user_id() IS NULL -- bypass
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Project.id
        AND pm.userId = app_current_user_id()
    )
  );

-- Experiment: linked to Project via projectId
CREATE POLICY experiment_access ON Experiment
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Experiment.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Trial: Experiment.projectId
CREATE POLICY trial_access ON Trial
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Experiment e ON e.id = Trial.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Run: not directly project-scoped; visible if any accessible
--      Trial references it through Measurement.
CREATE POLICY run_access ON Run
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM Measurement m
        JOIN Trial t ON t.id = m.trialId
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE m.runId = Run.id
        AND pm.userId = app_current_user_id()
    )
  );

-- Measurement: Trial -> Experiment -> Project
CREATE POLICY measurement_access ON Measurement
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Measurement.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Timeline: same join path as Measurement
CREATE POLICY timeline_access ON Timeline
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Timeline.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Source: shared across projects; visible if any accessible
--         Trial references it.
CREATE POLICY source_access ON Source
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM Trial t
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE t.sourceId = Source.id
        AND pm.userId = app_current_user_id()
    )
  );

-- ProfileData: same join path as Measurement
CREATE POLICY profiledata_access ON ProfileData
  FOR ALL USING (
    app_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = ProfileData.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- ============================================================
-- 8. Grants for rdb_app so RLS policies can be tested and enforced.
--    rdb_app needs SELECT (and write) on all tables so that
--    SET LOCAL ROLE rdb_app does not produce permission errors
--    before the RLS filter is applied.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rdb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rdb_app;

-- Used by ReBenchDB's perf-tracker, for self-performance tracking
CREATE PROCEDURE recordAdditionalMeasurement(
  aRunId int,
  aTrialId int,
  aCriterionId smallint,
  aValue float4)
LANGUAGE plpgsql
AS $$
  BEGIN
    UPDATE Measurement m
      SET values = array_append(values, aValue)
      WHERE
        m.runId = aRunId AND
        m.trialId = aTrialId AND
        m.criterion = aCriterionId AND
        m.invocation = 1;

    IF NOT FOUND THEN
      INSERT INTO Measurement (runId, trialId, criterion, invocation, values)
      VALUES (aRunId, aTrialId, aCriterionId, 1, ARRAY[aValue]);
    END IF;
  END;
$$;
