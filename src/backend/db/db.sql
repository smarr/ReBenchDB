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
  baseBranch varchar,

  namespaceId int NOT NULL REFERENCES Namespace (id)
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

-- User Accounts
CREATE TABLE Account (
  id serial primary key,
  userName varchar unique, -- has to be a valid `slug`
  email varchar unique,
  passwordHash varchar,
  apiToken char(64) NULL,
  createdAt timestamp with time zone DEFAULT now(),
  isActive bool NOT NULL DEFAULT true -- deactivated users cannot log in
);

CREATE TABLE Group (
  id serial primary key,
  groupName varchar unique, -- has to be a valid `slug`
  description text,
  createdAt timestamp with time zone DEFAULT now(),
  createdBy int REFERENCES Account (id)
);

-- A Namespace is either a user or group, and ensures that
-- there are no name collisions between users and groups.
CREATE TABLE Namespace (
  id serial primary key,
  name varchar unique NOT NULL, -- has to be a valid `slug`
  type char(1) CHECK (type IN ('u', 'g')),
  accountId int NULL REFERENCES Account (id),
  groupId int NULL REFERENCES Group (id),

  CONSTRAINT eitherAccountOrGroup CHECK (
    (accountId IS NOT NULL AND groupId IS     NULL AND type = 'u') OR
    (accountId IS     NULL AND groupId IS NOT NULL AND type = 'g')
  )
);

ALTER TABLE Account
  ADD COLUMN namespaceId int REFERENCES Namespace (id);
ALTER TABLE Group
  ADD COLUMN namespaceId int REFERENCES Namespace (id);

CREATE TYPE projectRole AS ENUM ('view', 'edit', 'owner');

CREATE TABLE ProjectPermissions (
  projectId int REFERENCES Project (id),
  namespaceId int REFERENCES Namespace (id),
  role projectRole NOT NULL,
  PRIMARY KEY (projectId, namespaceId)
);


  

TODO: group and project memberships

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
