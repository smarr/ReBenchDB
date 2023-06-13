-- migration to add support for storing profiling data
CREATE TABLE ProfileData (
  runId smallint,
  trialId smallint,
  invocation smallint,
  numIterations smallint,

  value text NOT NULL,

  primary key (numIterations, invocation, runId, trialId),
  foreign key (trialId) references Trial (id),
  foreign key (runId) references Run (id)
);
