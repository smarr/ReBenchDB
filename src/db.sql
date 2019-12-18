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
  memory varchar,
  cpu varchar,
  clockSpeed varchar,
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
  foreign key (unit) references Unit (name)
);

CREATE TABLE Project (
  id serial primary key,
  name varchar unique,
  description text,
  logo varchar
);

CREATE TABLE Source (
  id smallint primary key,
  repoURL varchar,
  branchOrTag varchar,
  commitId varchar,
  commitMessage text,
  author varchar,
  committer varchar
);

CREATE TABLE Experiment (
  id serial primary key,
  username varchar,
  envId smallint,
  sourceId smallint,
  manualRun bool,
  startTime timestamp,
  endTime timestamp,
  projectId smallint,

  foreign key (projectId) references Project (id),
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
  maxInvocationTime smallint,
  minIterationTime smallint,
  warmup smallint,

  foreign key (execId) references Executor (id),
  foreign key (benchmarkId) references Benchmark (id),
  foreign key (suiteId) references Suite (id)
);

CREATE TABLE Measurement (
  runId smallint,
  expId smallint,
  criterion smallint,
  invocation smallint,
  iteration smallint,

  value float4,

  primary key (iteration, invocation, runId, expId, criterion),
  foreign key (expId) references Experiment (id),
  foreign key (runId) references Run (id),
  foreign key (criterion) references Criterion (id)
);


