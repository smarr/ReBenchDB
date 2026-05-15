-- Change the smallint runId and trialId to int, to allow for more runs and trials.
ALTER TABLE Measurement
  ALTER COLUMN runId   TYPE int,
  ALTER COLUMN trialId TYPE int;

ALTER TABLE ProfileData
  ALTER COLUMN runId   TYPE int,
  ALTER COLUMN trialId TYPE int;

ALTER TABLE Timeline
  ALTER COLUMN runId   TYPE int,
  ALTER COLUMN trialId TYPE int;

DROP PROCEDURE recordAdditionalMeasurement(smallint, smallint, smallint, float4);

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
