-- add the envId to the unique constraint
-- or rather, drop the old constraint, and add a new one
ALTER TABLE Trial
  DROP CONSTRAINT trial_username_envid_starttime_key;

ALTER TABLE Trial
  ADD CONSTRAINT trial_username_envid_expid_starttime_key
    UNIQUE(username, envId, expId, startTime);
