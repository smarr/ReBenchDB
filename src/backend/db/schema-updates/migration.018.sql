-- The cmdline of a run is only unique within a single rebench.conf,
-- over time, all the other things may change, and I forgot some in 017.
ALTER TABLE Run
  DROP CONSTRAINT run_identity_key,
  ADD CONSTRAINT run_identity_key UNIQUE NULLS NOT DISTINCT (
    cmdline, benchmark, suite, executor, location,
    varValue, cores, inputSize, extraArgs,
    maxInvocationTime, minIterationTime, warmup);
