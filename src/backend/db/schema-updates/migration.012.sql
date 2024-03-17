-- First Create an index that helps with the data migration
BEGIN;

CREATE INDEX runid_trialid_criterion_invocation_idx
  ON Measurement (runId, trialId, criterion, invocation);

CREATE TEMPORARY TABLE temp_series_details AS (
  SELECT runId, trialId, criterion, invocation, max(iteration) as max FROM Measurement
  GROUP BY runId, trialId, criterion, invocation
);

CREATE TABLE TempMeasurement AS
	SELECT
		sd.runId, sd.trialId, sd.criterion, sd.invocation,
       	array_agg(value order by iteration) as values
	FROM temp_series_details sd
	CROSS JOIN generate_series(1, sd.max::INTEGER) as g(iteration)
	LEFT JOIN Measurement m USING (iteration, runId, trialId, criterion, invocation)
	GROUP BY sd.runId, sd.trialId, sd.criterion, sd.invocation;

-- put new table into place
DROP TABLE Measurement;
ALTER TABLE TempMeasurement RENAME TO Measurement;

-- add the PK and FK constraints
ALTER TABLE Measurement
  ADD PRIMARY KEY (invocation, runId, trialId, criterion);
ALTER TABLE Measurement
  ADD FOREIGN KEY (trialId) REFERENCES Trial (id);
ALTER TABLE Measurement
  ADD FOREIGN KEY (runId) REFERENCES Run (id);
ALTER TABLE Measurement
  ADD FOREIGN KEY (criterion) REFERENCES Criterion (id);

-- Add the now used recordAdditionalMeasurement.
-- It is used by ReBenchDB's perf-tracker, for self-performance tracking
CREATE PROCEDURE recordAdditionalMeasurement(
  aRunId smallint,
  aTrialId smallint,
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


COMMIT;
