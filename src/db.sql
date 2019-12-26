CREATE TABLE Executor (
  id serial primary key,
  name varchar unique,
  description text
);

CREATE TABLE Suite (
  id serial primary key,
  name varchar unique,
  description text
);

CREATE TABLE Benchmark (
  id serial primary key,
  name varchar unique,
  description varchar
);

CREATE TABLE SoftwareVersionInfo (
  id serial primary key,
  name varchar,
  version varchar,
  unique (name, version)
);

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

CREATE TABLE Unit (
  name varchar primary key,
  description text,
  lessIsBetter boolean
);

CREATE TABLE Criterion (
  id serial primary key,
  name varchar,
  unit varchar,

  unique (name, unit),
  foreign key (unit) references Unit (name)
);

CREATE TABLE Project (
  id serial primary key,
  name varchar unique,
  description text,
  logo varchar
);

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

CREATE TABLE Experiment (
  id serial primary key,

  name varchar NOT NULL,
  projectId smallint,

  description text,

  unique (projectId, name),

  foreign key (projectId) references Project (id)
);

CREATE TABLE Trial (
  id serial primary key,
  manualRun bool,
  startTime timestamp with time zone,

  expId smallint,

  username varchar,
  envId smallint,
  sourceId smallint,

  -- can only be supplied when everything is done
  -- but we may want to start storing data before
  endTime timestamp with time zone NULL,

  -- We assume that there is only
  -- a single experiment per user/environment/startTime.
  -- sourceId is not included, since it should be
  -- functionally dependent on startTime in the intended scenarios.
  unique (username, envId, startTime),

  foreign key (expId) references Experiment (id),
  foreign key (envId) references Environment (id),
  foreign key (sourceId) references Source (id)
);

CREATE TABLE SoftwareUse (
  envId smallint,
  softId smallint,
  primary key (envId, softId),

  foreign key (envId) references Environment (id),
  foreign key (softId) references SoftwareVersionInfo (id)
);

CREATE TABLE Run (
  id serial primary key,
  benchmarkId smallint,
  suiteId smallint,
  execId smallint,
  cmdline text unique,
  location text,
  varValue varchar,
  cores varchar,
  inputSize varchar,
  extraArgs varchar,
  maxInvocationTime smallint,
  minIterationTime smallint,
  warmup smallint,

  foreign key (execId) references Executor (id),
  foreign key (benchmarkId) references Benchmark (id),
  foreign key (suiteId) references Suite (id)
);

CREATE TABLE Measurement (
  runId smallint,
  trialId smallint,
  criterion smallint,
  invocation smallint,
  iteration smallint,

  value float4 NOT NULL,

  primary key (iteration, invocation, runId, trialId, criterion),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id),
  foreign key (criterion) references Criterion (id)
);


