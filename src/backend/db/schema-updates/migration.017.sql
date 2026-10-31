-- The cmdline of a run is only unique within a single rebench.conf,
-- over time, all the other things may change.
ALTER TABLE Run
  DROP CONSTRAINT run_cmdline_key,
  ADD CONSTRAINT run_identity_key UNIQUE NULLS NOT DISTINCT (
    cmdline, benchmark, suite, executor,
    location, maxInvocationTime, minIterationTime, warmup);
